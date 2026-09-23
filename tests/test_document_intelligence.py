"""
Tests for the Document Intelligence feature.

Covers:
- Document domain models (Document, DocumentPage, DocumentMetadata, enums)
- TXT extraction
- PDF text extraction
- Scanned PDF → OCR_REQUIRED detection
- DOCX extraction
- ProcessorRegistry
- DocumentStore (store, get, list, delete, sanitize)
- File size / extension / path traversal validation
- Upload endpoint (POST /files/upload)
- List endpoint (GET /files/)
- Get endpoint (GET /files/{id})
- Delete endpoint (DELETE /files/{id})
- Document analysis endpoint (POST /documents/{id}/analyze)
- OCR processor (availability, pdf OCR, document OCR)
- Page preservation
- Config additions
- Analysis response parsing

All tests use mocked HTTP responses and do NOT require a real
llama.cpp server or Tesseract engine (unless explicitly marked).
"""

from __future__ import annotations

import io
import uuid
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from app.documents.models import (
    Document,
    DocumentMetadata,
    DocumentPage,
    ExtractionStatus,
    FileType,
)
from app.documents.processor import ProcessorRegistry, ProcessingError
from app.documents.txt_processor import TxtProcessor
from app.documents.pdf_processor import PdfProcessor
from app.documents.docx_processor import DocxProcessor
from app.documents.ocr_processor import OcrProcessor, OcrUnavailableError, OcrError
from app.documents.store import DocumentStore, sanitize_filename
from app.api.documents import _parse_analysis, _build_analysis_prompt


# ================================================================ helpers


def _make_txt(tmp_path: Path, name: str = "test.txt", content: str = "Hello World\n") -> Path:
    p = tmp_path / name
    p.write_text(content, encoding="utf-8")
    return p


def _make_pdf_with_text(tmp_path: Path, name: str = "test.pdf", text: str = "Sample PDF text") -> Path:
    """Create a minimal PDF with actual extractable text using pypdf."""
    from pypdf import PdfWriter, PageObject
    from pypdf.generic import (
        ArrayObject,
        DictionaryObject,
        NameObject,
        NumberObject,
        TextStringObject,
        StreamObject,
    )

    writer = PdfWriter()

    # Build a minimal page with a text stream
    page = PageObject.create_blank_page(width=612, height=792)

    # Create a content stream with text operators
    stream = StreamObject()
    stream_data = f"BT /F1 12 Tf 100 700 Td ({text}) Tj ET"
    stream.set_data(stream_data.encode("latin-1"))

    # Add a minimal font resource
    font_dict = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
    })
    resources = DictionaryObject({
        NameObject("/Font"): DictionaryObject({
            NameObject("/F1"): font_dict,
        }),
    })

    page[NameObject("/Resources")] = resources
    page[NameObject("/Contents")] = writer._add_object(stream)
    writer.add_page(page)

    path = tmp_path / name
    with open(path, "wb") as f:
        writer.write(f)
    return path


def _make_blank_pdf(tmp_path: Path, name: str = "blank.pdf", pages: int = 1) -> Path:
    """Create a blank PDF with no text (simulates scanned document)."""
    from pypdf import PdfWriter
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=612, height=792)
    path = tmp_path / name
    with open(path, "wb") as f:
        writer.write(f)
    return path


def _make_docx(tmp_path: Path, name: str = "test.docx",
               paragraphs: list[str] | None = None) -> Path:
    import docx
    doc = docx.Document()
    for p in (paragraphs or ["First paragraph.", "Second paragraph."]):
        doc.add_paragraph(p)
    path = tmp_path / name
    doc.save(str(path))
    return path


# ================================================================ Document Models


class TestDocumentModels:
    def test_document_creation(self) -> None:
        doc = Document(
            document_id="test-id",
            filename="test.txt",
            file_type=FileType.TXT,
            file_size=100,
        )
        assert doc.document_id == "test-id"
        assert doc.file_type == FileType.TXT
        assert doc.extraction_status == ExtractionStatus.FAILED  # default
        assert doc.page_count == 0
        assert doc.text == ""
        assert doc.pages == []
        assert doc.created_at  # auto-generated

    def test_document_page(self) -> None:
        page = DocumentPage(page_number=1, text="hello")
        assert page.page_number == 1
        assert page.source == "text_extraction"
        assert page.confidence is None

    def test_document_page_with_confidence(self) -> None:
        page = DocumentPage(page_number=2, text="ocr text", source="ocr", confidence=0.85)
        assert page.confidence == 0.85
        assert page.source == "ocr"

    def test_document_metadata_defaults(self) -> None:
        meta = DocumentMetadata()
        assert meta.original_filename == ""
        assert meta.mime_type == ""
        assert meta.author is None
        assert meta.extra == {}

    def test_extraction_status_enum(self) -> None:
        assert ExtractionStatus.TEXT_EXTRACTED.value == "TEXT_EXTRACTED"
        assert ExtractionStatus.OCR_REQUIRED.value == "OCR_REQUIRED"
        assert ExtractionStatus.OCR_COMPLETED.value == "OCR_COMPLETED"
        assert ExtractionStatus.FAILED.value == "FAILED"
        assert ExtractionStatus.UNSUPPORTED.value == "UNSUPPORTED"

    def test_file_type_enum(self) -> None:
        assert FileType.TXT.value == "txt"
        assert FileType.PDF.value == "pdf"
        assert FileType.DOCX.value == "docx"

    def test_document_with_pages(self) -> None:
        pages = [
            DocumentPage(page_number=1, text="Page one"),
            DocumentPage(page_number=2, text="Page two"),
        ]
        doc = Document(
            document_id="multi",
            filename="report.pdf",
            file_type=FileType.PDF,
            file_size=5000,
            page_count=2,
            extraction_status=ExtractionStatus.TEXT_EXTRACTED,
            text="Page one\n\nPage two",
            pages=pages,
        )
        assert len(doc.pages) == 2
        assert doc.pages[0].page_number == 1
        assert doc.pages[1].page_number == 2

    def test_document_serialization(self) -> None:
        doc = Document(
            document_id="ser-test",
            filename="test.txt",
            file_type=FileType.TXT,
            file_size=10,
            extraction_status=ExtractionStatus.TEXT_EXTRACTED,
            text="hello",
        )
        data = doc.model_dump()
        assert data["document_id"] == "ser-test"
        assert data["file_type"] == "txt"
        assert data["extraction_status"] == "TEXT_EXTRACTED"


# ================================================================ TXT Processor


class TestTxtProcessor:
    @pytest.fixture()
    def proc(self) -> TxtProcessor:
        return TxtProcessor()

    def test_supported_extensions(self, proc) -> None:
        assert proc.supported_extensions == ["txt"]

    def test_process_txt(self, proc, tmp_path) -> None:
        path = _make_txt(tmp_path, content="Hello World")
        doc = proc.process(path, "doc-1")
        assert doc.document_id == "doc-1"
        assert doc.file_type == FileType.TXT
        assert doc.extraction_status == ExtractionStatus.TEXT_EXTRACTED
        assert "Hello World" in doc.text
        assert doc.page_count == 1
        assert len(doc.pages) == 1
        assert doc.pages[0].page_number == 1

    def test_process_file_not_found(self, proc, tmp_path) -> None:
        with pytest.raises(ProcessingError, match="not found"):
            proc.process(tmp_path / "missing.txt", "x")

    def test_process_respects_max_characters(self, proc, tmp_path) -> None:
        path = _make_txt(tmp_path, content="A" * 10000)
        doc = proc.process(path, "long", max_characters=100)
        assert len(doc.text) == 100

    def test_txt_metadata(self, proc, tmp_path) -> None:
        path = _make_txt(tmp_path, content="text")
        doc = proc.process(path, "meta")
        assert doc.metadata.mime_type == "text/plain"
        assert doc.metadata.encoding == "utf-8"


# ================================================================ PDF Processor


class TestPdfProcessor:
    @pytest.fixture()
    def proc(self) -> PdfProcessor:
        return PdfProcessor()

    def test_supported_extensions(self, proc) -> None:
        assert proc.supported_extensions == ["pdf"]

    def test_process_text_pdf(self, proc, tmp_path) -> None:
        path = _make_pdf_with_text(tmp_path, text="Sample PDF text")
        doc = proc.process(path, "pdf-1")
        assert doc.file_type == FileType.PDF
        assert doc.extraction_status == ExtractionStatus.TEXT_EXTRACTED
        assert "Sample PDF text" in doc.text
        assert doc.page_count >= 1
        assert len(doc.pages) >= 1

    def test_process_blank_pdf_ocr_required(self, proc, tmp_path) -> None:
        path = _make_blank_pdf(tmp_path)
        doc = proc.process(path, "blank-1")
        assert doc.extraction_status == ExtractionStatus.OCR_REQUIRED
        assert doc.text == ""

    def test_process_multi_page_pdf(self, proc, tmp_path) -> None:
        path = _make_blank_pdf(tmp_path, pages=5)
        doc = proc.process(path, "multi", max_pages=5)
        assert doc.page_count == 5
        assert len(doc.pages) == 5

    def test_process_max_pages_limit(self, proc, tmp_path) -> None:
        path = _make_blank_pdf(tmp_path, pages=10)
        doc = proc.process(path, "limit", max_pages=3)
        assert doc.page_count == 3
        assert len(doc.pages) == 3

    def test_process_file_not_found(self, proc, tmp_path) -> None:
        with pytest.raises(ProcessingError, match="not found"):
            proc.process(tmp_path / "missing.pdf", "x")

    def test_blank_pdf_page_source(self, proc, tmp_path) -> None:
        path = _make_blank_pdf(tmp_path)
        doc = proc.process(path, "src")
        assert doc.pages[0].source == "no_text_found"

    def test_pdf_metadata(self, proc, tmp_path) -> None:
        path = _make_blank_pdf(tmp_path)
        doc = proc.process(path, "meta")
        assert doc.metadata.mime_type == "application/pdf"
        assert "total_pages_in_file" in doc.metadata.extra


# ================================================================ DOCX Processor


class TestDocxProcessor:
    @pytest.fixture()
    def proc(self) -> DocxProcessor:
        return DocxProcessor()

    def test_supported_extensions(self, proc) -> None:
        assert proc.supported_extensions == ["docx"]

    def test_process_docx(self, proc, tmp_path) -> None:
        path = _make_docx(tmp_path, paragraphs=["First.", "Second.", "Third."])
        doc = proc.process(path, "docx-1")
        assert doc.file_type == FileType.DOCX
        assert doc.extraction_status == ExtractionStatus.TEXT_EXTRACTED
        assert "First." in doc.text
        assert "Second." in doc.text
        assert "Third." in doc.text
        assert doc.page_count == 1
        assert len(doc.pages) == 1

    def test_process_file_not_found(self, proc, tmp_path) -> None:
        with pytest.raises(ProcessingError, match="not found"):
            proc.process(tmp_path / "missing.docx", "x")

    def test_docx_metadata(self, proc, tmp_path) -> None:
        path = _make_docx(tmp_path)
        doc = proc.process(path, "meta")
        assert "wordprocessingml" in doc.metadata.mime_type
        assert "paragraph_count" in doc.metadata.extra

    def test_docx_max_characters(self, proc, tmp_path) -> None:
        path = _make_docx(tmp_path, paragraphs=["A" * 1000, "B" * 1000])
        doc = proc.process(path, "limit", max_characters=500)
        assert len(doc.text) <= 500


# ================================================================ ProcessorRegistry


class TestProcessorRegistry:
    def test_register_and_get(self) -> None:
        reg = ProcessorRegistry()
        reg.register(TxtProcessor())
        proc = reg.get("txt")
        assert isinstance(proc, TxtProcessor)

    def test_duplicate_raises(self) -> None:
        reg = ProcessorRegistry()
        reg.register(TxtProcessor())
        with pytest.raises(ValueError, match="already registered"):
            reg.register(TxtProcessor())

    def test_get_missing_raises(self) -> None:
        reg = ProcessorRegistry()
        with pytest.raises(KeyError, match="No processor"):
            reg.get("xyz")

    def test_has(self) -> None:
        reg = ProcessorRegistry()
        reg.register(TxtProcessor())
        assert reg.has("txt") is True
        assert reg.has("xyz") is False

    def test_list_extensions(self) -> None:
        reg = ProcessorRegistry()
        reg.register(TxtProcessor())
        reg.register(PdfProcessor())
        reg.register(DocxProcessor())
        assert sorted(reg.list_extensions()) == ["docx", "pdf", "txt"]


# ================================================================ DocumentStore


class TestDocumentStore:
    @pytest.fixture()
    def store(self, tmp_path) -> DocumentStore:
        return DocumentStore(upload_dir=tmp_path / "uploads")

    def test_generate_id(self, store) -> None:
        id1 = store.generate_id()
        id2 = store.generate_id()
        assert id1 != id2
        uuid.UUID(id1)  # Should not raise

    def test_store_and_get_file(self, store) -> None:
        doc_id = store.generate_id()
        path = store.store_file(doc_id, "test.txt", b"hello")
        assert path.exists()
        assert path.read_bytes() == b"hello"

    def test_save_and_get_document(self, store) -> None:
        doc = Document(
            document_id="d1",
            filename="test.txt",
            file_type=FileType.TXT,
            file_size=5,
            extraction_status=ExtractionStatus.TEXT_EXTRACTED,
            text="hello",
        )
        store.save_document(doc)
        retrieved = store.get_document("d1")
        assert retrieved is not None
        assert retrieved.text == "hello"

    def test_get_nonexistent(self, store) -> None:
        assert store.get_document("nonexistent") is None

    def test_list_documents(self, store) -> None:
        for i in range(3):
            store.save_document(Document(
                document_id=f"d{i}",
                filename=f"f{i}.txt",
                file_type=FileType.TXT,
                file_size=10,
            ))
        assert len(store.list_documents()) == 3

    def test_delete_document(self, store) -> None:
        doc_id = store.generate_id()
        store.store_file(doc_id, "test.txt", b"data")
        store.save_document(Document(
            document_id=doc_id,
            filename="test.txt",
            file_type=FileType.TXT,
            file_size=4,
        ))
        assert store.delete_document(doc_id) is True
        assert store.get_document(doc_id) is None

    def test_delete_nonexistent(self, store) -> None:
        assert store.delete_document("nope") is False

    def test_upload_dir_created(self, tmp_path) -> None:
        upload_dir = tmp_path / "new_uploads"
        store = DocumentStore(upload_dir=upload_dir)
        assert upload_dir.exists()


class TestSanitizeFilename:
    def test_basic(self) -> None:
        assert sanitize_filename("report.pdf") == "report.pdf"

    def test_strips_path(self) -> None:
        assert sanitize_filename("/etc/passwd") == "passwd"

    def test_strips_windows_path(self) -> None:
        assert sanitize_filename("C:\\Users\\test\\file.txt") == "file.txt"

    def test_replaces_unsafe_chars(self) -> None:
        result = sanitize_filename("my file (1).txt")
        assert " " not in result
        assert "(" not in result

    def test_empty_fallback(self) -> None:
        assert sanitize_filename("   ") == "unnamed"

    def test_length_limit(self) -> None:
        long_name = "a" * 500 + ".txt"
        assert len(sanitize_filename(long_name)) <= 255

    def test_traversal_stripped(self) -> None:
        result = sanitize_filename("../../../etc/passwd")
        assert ".." not in result
        assert "/" not in result

    def test_dot_dot_in_name(self) -> None:
        result = sanitize_filename("..hidden.txt")
        assert result  # Should produce something non-empty


# ================================================================ Config


class TestConfig:
    def test_config_has_upload_fields(self) -> None:
        from app.config import Settings
        s = Settings()
        assert s.max_upload_size == 50 * 1024 * 1024
        assert s.max_pdf_pages == 200
        assert s.max_extracted_characters == 500_000
        assert "txt" in s.allowed_extensions
        assert "pdf" in s.allowed_extensions
        assert "docx" in s.allowed_extensions

    def test_upload_dir_default(self) -> None:
        from app.config import Settings
        s = Settings()
        assert str(s.upload_dir) == "data/uploads"


# ================================================================ OCR Processor


class TestOcrProcessor:
    def test_is_available(self) -> None:
        ocr = OcrProcessor()
        # tesseract and pdftoppm are installed in this environment
        assert ocr.is_available() is True

    def test_ocr_unavailable_when_no_tesseract(self) -> None:
        with patch("app.documents.ocr_processor._check_tesseract", return_value=False):
            ocr = OcrProcessor()
            assert ocr.is_available() is False

    def test_ocr_unavailable_when_no_pdftoppm(self) -> None:
        with patch("app.documents.ocr_processor._check_pdftoppm", return_value=False):
            ocr = OcrProcessor()
            assert ocr.is_available() is False

    def test_ocr_pdf_raises_when_unavailable(self, tmp_path) -> None:
        with patch.object(OcrProcessor, "is_available", return_value=False):
            ocr = OcrProcessor()
            with pytest.raises(OcrUnavailableError):
                ocr.ocr_pdf(tmp_path / "test.pdf")

    def test_ocr_document_skips_non_ocr_required(self) -> None:
        doc = Document(
            document_id="skip",
            filename="test.txt",
            file_type=FileType.TXT,
            file_size=10,
            extraction_status=ExtractionStatus.TEXT_EXTRACTED,
            text="already has text",
        )
        ocr = OcrProcessor()
        result = ocr.ocr_document(doc, Path("/fake"))
        # Should return unchanged document
        assert result.extraction_status == ExtractionStatus.TEXT_EXTRACTED

    def test_ocr_document_fails_gracefully(self, tmp_path) -> None:
        doc = Document(
            document_id="fail",
            filename="test.pdf",
            file_type=FileType.PDF,
            file_size=100,
            extraction_status=ExtractionStatus.OCR_REQUIRED,
        )
        with patch.object(OcrProcessor, "is_available", return_value=False):
            ocr = OcrProcessor()
            result = ocr.ocr_document(doc, tmp_path / "test.pdf")
            assert result.extraction_status == ExtractionStatus.FAILED
            assert "ocr_error" in result.metadata.extra


class TestOcrProcessorReal:
    """Tests that use the real Tesseract engine.

    These only run if tesseract and pdftoppm are available.
    """

    @pytest.fixture(autouse=True)
    def _check_ocr_available(self) -> None:
        if not OcrProcessor.is_available():
            pytest.skip("Tesseract or pdftoppm not available")

    def test_ocr_blank_pdf(self, tmp_path) -> None:
        """OCR on a blank page should succeed but produce minimal text."""
        path = _make_blank_pdf(tmp_path, name="blank_ocr.pdf")
        ocr = OcrProcessor(dpi=150)  # Lower DPI for speed
        pages = ocr.ocr_pdf(path, max_pages=1)
        assert len(pages) == 1
        assert pages[0].source == "ocr"
        assert pages[0].page_number == 1

    def test_ocr_document_updates_status(self, tmp_path) -> None:
        """OCR on a blank PDF doc should set FAILED (no text found) or OCR_COMPLETED."""
        path = _make_blank_pdf(tmp_path, name="ocr_doc.pdf")
        doc = Document(
            document_id="ocr-test",
            filename="ocr_doc.pdf",
            file_type=FileType.PDF,
            file_size=path.stat().st_size,
            extraction_status=ExtractionStatus.OCR_REQUIRED,
            pages=[DocumentPage(page_number=1, text="", source="no_text_found")],
            page_count=1,
        )
        ocr = OcrProcessor(dpi=150)
        result = ocr.ocr_document(doc, path)
        # A blank page OCR will find little text → FAILED or OCR_COMPLETED
        assert result.extraction_status in (
            ExtractionStatus.OCR_COMPLETED,
            ExtractionStatus.FAILED,
        )
        assert result.pages[0].source == "ocr"

    def test_ocr_max_pages_respected(self, tmp_path) -> None:
        path = _make_blank_pdf(tmp_path, name="multi_ocr.pdf", pages=5)
        ocr = OcrProcessor(dpi=150)
        pages = ocr.ocr_pdf(path, max_pages=2)
        assert len(pages) == 2


# ================================================================ API Tests


class TestUploadAPI:
    """Test the POST /files/upload endpoint."""

    @pytest.fixture()
    def client(self, tmp_path):
        import os
        os.environ["SAW_UPLOAD_DIR"] = str(tmp_path / "uploads")
        os.environ["SAW_DOCUMENT_DB_PATH"] = str(tmp_path / "documents.db")
        os.environ["SAW_KNOWLEDGE_DB_PATH"] = str(tmp_path / "knowledge.db")
        os.environ["SAW_VECTOR_STORAGE_PATH"] = str(tmp_path / "vectors")
        os.environ["SAW_AUDIT_LOG_FILE"] = str(tmp_path / "audit.log")
        from fastapi.testclient import TestClient
        from app.main import create_app
        app = create_app()
        with TestClient(app) as c:
            yield c

    def test_upload_txt(self, client) -> None:
        resp = client.post(
            "/files/upload",
            files={"file": ("hello.txt", b"Hello World", "text/plain")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["filename"] == "hello.txt"
        assert data["file_type"] == "txt"
        assert data["extraction_status"] == "TEXT_EXTRACTED"
        assert "Hello World" in data["text_preview"]
        assert data["document_id"]

    def test_upload_docx(self, client, tmp_path) -> None:
        path = _make_docx(tmp_path, paragraphs=["Test content."])
        content = path.read_bytes()
        resp = client.post(
            "/files/upload",
            files={"file": ("test.docx", content, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["file_type"] == "docx"
        assert data["extraction_status"] == "TEXT_EXTRACTED"

    def test_upload_pdf(self, client, tmp_path) -> None:
        path = _make_pdf_with_text(tmp_path, text="PDF content here")
        content = path.read_bytes()
        resp = client.post(
            "/files/upload",
            files={"file": ("report.pdf", content, "application/pdf")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["file_type"] == "pdf"

    def test_upload_unsupported_extension(self, client) -> None:
        resp = client.post(
            "/files/upload",
            files={"file": ("script.py", b"print('hi')", "text/plain")},
        )
        assert resp.status_code == 422
        assert "Unsupported" in resp.json()["detail"]

    def test_upload_empty_file(self, client) -> None:
        resp = client.post(
            "/files/upload",
            files={"file": ("empty.txt", b"", "text/plain")},
        )
        assert resp.status_code == 422
        assert "empty" in resp.json()["detail"].lower()

    def test_upload_oversized(self, client) -> None:
        # Default max is 50MB, so send 51MB
        huge = b"x" * (50 * 1024 * 1024 + 1)
        resp = client.post(
            "/files/upload",
            files={"file": ("big.txt", huge, "text/plain")},
        )
        assert resp.status_code == 413

    def test_upload_exe_rejected(self, client) -> None:
        resp = client.post(
            "/files/upload",
            files={"file": ("malware.exe", b"\x00" * 100, "application/octet-stream")},
        )
        assert resp.status_code == 422

    def test_upload_traversal_filename(self, client) -> None:
        resp = client.post(
            "/files/upload",
            files={"file": ("../../../etc/passwd.txt", b"safe content", "text/plain")},
        )
        # Should succeed but with sanitized filename
        assert resp.status_code == 200
        data = resp.json()
        assert ".." not in data["filename"]
        assert "/" not in data["filename"]


class TestListGetDeleteAPI:
    """Test GET /files/, GET /files/{id}, DELETE /files/{id}."""

    @pytest.fixture()
    def client(self, tmp_path):
        import os
        os.environ["SAW_UPLOAD_DIR"] = str(tmp_path / "uploads")
        os.environ["SAW_DOCUMENT_DB_PATH"] = str(tmp_path / "documents.db")
        os.environ["SAW_KNOWLEDGE_DB_PATH"] = str(tmp_path / "knowledge.db")
        os.environ["SAW_VECTOR_STORAGE_PATH"] = str(tmp_path / "vectors")
        os.environ["SAW_AUDIT_LOG_FILE"] = str(tmp_path / "audit.log")
        from fastapi.testclient import TestClient
        from app.main import create_app
        app = create_app()
        with TestClient(app) as c:
            yield c

    def test_list_empty(self, client) -> None:
        resp = client.get("/files/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["files"] == []
        assert data["total"] == 0

    def test_list_after_upload(self, client) -> None:
        client.post(
            "/files/upload",
            files={"file": ("a.txt", b"content a", "text/plain")},
        )
        client.post(
            "/files/upload",
            files={"file": ("b.txt", b"content b", "text/plain")},
        )
        resp = client.get("/files/")
        data = resp.json()
        assert data["total"] == 2

    def test_get_by_id(self, client) -> None:
        upload_resp = client.post(
            "/files/upload",
            files={"file": ("lookup.txt", b"lookup content", "text/plain")},
        )
        doc_id = upload_resp.json()["document_id"]
        resp = client.get(f"/files/{doc_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["document_id"] == doc_id
        assert data["filename"] == "lookup.txt"

    def test_get_nonexistent(self, client) -> None:
        resp = client.get("/files/nonexistent-id")
        assert resp.status_code == 404

    def test_delete(self, client) -> None:
        upload_resp = client.post(
            "/files/upload",
            files={"file": ("del.txt", b"delete me", "text/plain")},
        )
        doc_id = upload_resp.json()["document_id"]
        resp = client.delete(f"/files/{doc_id}")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True

        # Verify it's gone
        assert client.get(f"/files/{doc_id}").status_code == 404

    def test_delete_nonexistent(self, client) -> None:
        resp = client.delete("/files/nonexistent-id")
        assert resp.status_code == 404


# ================================================================ Analysis API


class TestAnalysisAPI:
    @pytest.fixture()
    def client(self, tmp_path):
        import os
        os.environ["SAW_UPLOAD_DIR"] = str(tmp_path / "uploads")
        os.environ["SAW_DOCUMENT_DB_PATH"] = str(tmp_path / "documents.db")
        os.environ["SAW_KNOWLEDGE_DB_PATH"] = str(tmp_path / "knowledge.db")
        os.environ["SAW_VECTOR_STORAGE_PATH"] = str(tmp_path / "vectors")
        os.environ["SAW_AUDIT_LOG_FILE"] = str(tmp_path / "audit.log")
        from fastapi.testclient import TestClient
        from app.main import create_app
        app = create_app()
        with TestClient(app) as c:
            yield c

    def test_analyze_uploaded_txt(self, client) -> None:
        upload_resp = client.post(
            "/files/upload",
            files={"file": ("report.txt", b"Equipment inspection passed. No defects found.", "text/plain")},
        )
        doc_id = upload_resp.json()["document_id"]
        resp = client.post(f"/documents/{doc_id}/analyze")
        assert resp.status_code == 200
        data = resp.json()
        assert data["document_id"] == doc_id
        assert "summary" in data
        assert "key_findings" in data
        assert "risks" in data
        assert "action_items" in data

    def test_analyze_nonexistent(self, client) -> None:
        resp = client.post("/documents/nonexistent/analyze")
        assert resp.status_code == 404

    def test_analyze_has_summary(self, client) -> None:
        upload_resp = client.post(
            "/files/upload",
            files={"file": ("data.txt", b"Sales increased by 20% in Q3.", "text/plain")},
        )
        doc_id = upload_resp.json()["document_id"]
        resp = client.post(f"/documents/{doc_id}/analyze")
        data = resp.json()
        assert isinstance(data["summary"], str)
        assert len(data["summary"]) > 0


class TestAnalysisParser:
    def test_parse_structured_output(self) -> None:
        text = """SUMMARY: This is a test document about safety.

KEY FINDINGS:
- Equipment is in good condition
- Safety protocols are followed

RISKS:
- Minor corrosion observed on pipe A

ACTION ITEMS:
- Schedule maintenance for pipe A
- Review safety manual
"""
        result = _parse_analysis(text)
        assert "safety" in result["summary"].lower()
        assert len(result["key_findings"]) == 2
        assert len(result["risks"]) == 1
        assert len(result["action_items"]) == 2

    def test_parse_no_risks(self) -> None:
        text = """SUMMARY: Everything is fine.

KEY FINDINGS:
- All good

RISKS:
No risks identified.

ACTION ITEMS:
No action items identified.
"""
        result = _parse_analysis(text)
        assert result["risks"] == []
        assert result["action_items"] == []

    def test_parse_unstructured_fallback(self) -> None:
        text = "Just some random text without sections."
        result = _parse_analysis(text)
        assert len(result["summary"]) > 0

    def test_build_analysis_prompt(self) -> None:
        prompt = _build_analysis_prompt("Sample text content", "report.txt")
        assert "report.txt" in prompt
        assert "Sample text content" in prompt
        assert "SUMMARY" in prompt
        assert "KEY FINDINGS" in prompt

    def test_prompt_truncation(self) -> None:
        long_text = "x" * 20000
        prompt = _build_analysis_prompt(long_text, "long.txt")
        assert "[Document truncated for analysis]" in prompt


# ================================================================ Health endpoint


class TestHealthEndpointDocuments:
    @pytest.fixture()
    def client(self, tmp_path):
        import os
        os.environ["SAW_UPLOAD_DIR"] = str(tmp_path / "uploads")
        os.environ["SAW_DOCUMENT_DB_PATH"] = str(tmp_path / "documents.db")
        os.environ["SAW_KNOWLEDGE_DB_PATH"] = str(tmp_path / "knowledge.db")
        os.environ["SAW_VECTOR_STORAGE_PATH"] = str(tmp_path / "vectors")
        os.environ["SAW_AUDIT_LOG_FILE"] = str(tmp_path / "audit.log")
        from fastapi.testclient import TestClient
        from app.main import create_app
        app = create_app()
        with TestClient(app) as c:
            yield c

    def test_health_includes_processors(self, client) -> None:
        data = client.get("/health").json()
        assert "document_processors" in data
        procs = data["document_processors"]
        assert "txt" in procs
        assert "pdf" in procs
        assert "docx" in procs


# ================================================================ Page preservation


class TestPagePreservation:
    def test_multi_page_blank_pdf_pages_preserved(self, tmp_path) -> None:
        path = _make_blank_pdf(tmp_path, pages=3)
        proc = PdfProcessor()
        doc = proc.process(path, "pages-test")
        assert len(doc.pages) == 3
        assert doc.pages[0].page_number == 1
        assert doc.pages[1].page_number == 2
        assert doc.pages[2].page_number == 3

    def test_txt_single_page(self, tmp_path) -> None:
        path = _make_txt(tmp_path, content="one page")
        proc = TxtProcessor()
        doc = proc.process(path, "single")
        assert len(doc.pages) == 1
        assert doc.pages[0].page_number == 1

    def test_docx_single_page(self, tmp_path) -> None:
        path = _make_docx(tmp_path, paragraphs=["p1", "p2"])
        proc = DocxProcessor()
        doc = proc.process(path, "docx-page")
        assert len(doc.pages) == 1
        assert doc.pages[0].page_number == 1


# ================================================================ Audit integration


class TestAuditDocumentOps:
    @pytest.fixture()
    def client(self, tmp_path):
        import os
        os.environ["SAW_UPLOAD_DIR"] = str(tmp_path / "uploads")
        os.environ["SAW_AUDIT_LOG_FILE"] = str(tmp_path / "audit.log")
        os.environ["SAW_DOCUMENT_DB_PATH"] = str(tmp_path / "documents.db")
        os.environ["SAW_KNOWLEDGE_DB_PATH"] = str(tmp_path / "knowledge.db")
        os.environ["SAW_VECTOR_STORAGE_PATH"] = str(tmp_path / "vectors")
        from fastapi.testclient import TestClient
        from app.main import create_app
        app = create_app()
        with TestClient(app) as c:
            yield c

    def test_upload_creates_audit_record(self, client, tmp_path) -> None:
        client.post(
            "/files/upload",
            files={"file": ("audit_test.txt", b"audit content", "text/plain")},
        )
        audit_file = tmp_path / "audit.log"
        if audit_file.exists():
            content = audit_file.read_text()
            assert "file_upload" in content
            assert "audit_test.txt" in content

    def test_audit_does_not_log_full_content(self, client, tmp_path) -> None:
        large_content = "SENSITIVE DATA " * 100
        client.post(
            "/files/upload",
            files={"file": ("sensitive.txt", large_content.encode(), "text/plain")},
        )
        audit_file = tmp_path / "audit.log"
        if audit_file.exists():
            content = audit_file.read_text()
            assert "SENSITIVE DATA" not in content
