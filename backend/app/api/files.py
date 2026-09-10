"""
Files API routes.

Provides secure file upload, listing, retrieval, and deletion
for the Document Intelligence subsystem.

Security:
- Configurable maximum file size
- Filename sanitization (no path traversal)
- Extension allowlist (txt, pdf, docx only)
- Files stored under a UUID-prefixed directory
- No executable files accepted
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request, UploadFile
from pydantic import BaseModel

from app.documents.models import ExtractionStatus
from app.documents.ocr_processor import OcrProcessor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["files"])


class FileUploadResponse(BaseModel):
    document_id: str
    filename: str
    file_type: str
    file_size: int
    extraction_status: str
    page_count: int
    text_preview: str


class FileInfoResponse(BaseModel):
    document_id: str
    filename: str
    file_type: str
    file_size: int
    extraction_status: str
    page_count: int
    created_at: str
    text_preview: str


class FileListResponse(BaseModel):
    files: list[FileInfoResponse]
    total: int


class DeleteResponse(BaseModel):
    deleted: bool
    document_id: str


def _text_preview(text: str, max_len: int = 500) -> str:
    """Return a truncated preview of the document text."""
    if len(text) <= max_len:
        return text
    return text[:max_len] + "..."


@router.post("/upload", response_model=FileUploadResponse)
async def upload_file(file: UploadFile, request: Request) -> FileUploadResponse:
    """Upload a file and extract its text content.

    Supported formats: TXT, PDF, DOCX.

    The file is validated (size, extension), stored securely, and
    processed through the appropriate document processor. If the
    document is a scanned PDF with no extractable text, OCR is
    attempted automatically using the local Tesseract engine.
    """
    settings = request.app.state.settings
    doc_store = request.app.state.document_store
    proc_registry = request.app.state.processor_registry
    audit = request.app.state.audit_service

    if not file.filename:
        raise HTTPException(status_code=422, detail="Filename is required.")

    # --- Extension validation ---
    from app.documents.store import sanitize_filename
    safe_name = sanitize_filename(file.filename)
    ext = safe_name.rsplit(".", maxsplit=1)[-1].lower() if "." in safe_name else ""

    if ext not in settings.allowed_extensions:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '.{ext}'. "
                   f"Allowed: {settings.allowed_extensions}",
        )

    # --- Read and validate size ---
    content = await file.read()
    if len(content) > settings.max_upload_size:
        raise HTTPException(
            status_code=413,
            detail=f"File size ({len(content)} bytes) exceeds maximum "
                   f"({settings.max_upload_size} bytes).",
        )

    if len(content) == 0:
        raise HTTPException(status_code=422, detail="File is empty.")

    # --- Store file ---
    document_id = doc_store.generate_id()
    file_path = doc_store.store_file(document_id, safe_name, content)

    # --- Process ---
    try:
        processor = proc_registry.get(ext)
    except KeyError:
        raise HTTPException(
            status_code=422,
            detail=f"No processor available for '.{ext}'.",
        )

    try:
        document = processor.process(
            file_path,
            document_id,
            max_pages=settings.max_pdf_pages,
            max_characters=settings.max_extracted_characters,
        )
    except Exception as exc:
        logger.error("Processing failed for %s: %s", safe_name, exc)
        raise HTTPException(
            status_code=500,
            detail=f"Document processing failed: {exc}",
        )

    # Update metadata with original filename
    document = document.model_copy(
        update={
            "metadata": document.metadata.model_copy(
                update={
                    "original_filename": file.filename or safe_name,
                    "stored_filename": safe_name,
                }
            )
        }
    )

    # --- Auto-OCR for scanned PDFs ---
    if document.extraction_status == ExtractionStatus.OCR_REQUIRED:
        ocr = OcrProcessor()
        if ocr.is_available():
            document = ocr.ocr_document(
                document,
                file_path,
                max_pages=settings.max_pdf_pages,
                max_characters=settings.max_extracted_characters,
            )

    doc_store.save_document(document)

    # --- Audit (metadata only, no content) ---
    audit.record(
        task="file_upload",
        selected_model="none",
        execution_status="success",
        metadata={
            "document_id": document_id,
            "filename": safe_name,
            "file_type": ext,
            "file_size": len(content),
            "page_count": document.page_count,
            "extraction_status": document.extraction_status.value,
        },
    )

    return FileUploadResponse(
        document_id=document.document_id,
        filename=document.filename,
        file_type=document.file_type.value,
        file_size=document.file_size,
        extraction_status=document.extraction_status.value,
        page_count=document.page_count,
        text_preview=_text_preview(document.text),
    )


@router.get("/", response_model=FileListResponse)
def list_files(request: Request) -> FileListResponse:
    """List all uploaded documents."""
    doc_store = request.app.state.document_store
    docs = doc_store.list_documents()
    files = [
        FileInfoResponse(
            document_id=d.document_id,
            filename=d.filename,
            file_type=d.file_type.value,
            file_size=d.file_size,
            extraction_status=d.extraction_status.value,
            page_count=d.page_count,
            created_at=d.created_at,
            text_preview=_text_preview(d.text),
        )
        for d in docs
    ]
    return FileListResponse(files=files, total=len(files))


@router.get("/{document_id}", response_model=FileInfoResponse)
def get_file(document_id: str, request: Request) -> FileInfoResponse:
    """Get details of a specific uploaded document."""
    doc_store = request.app.state.document_store
    doc = doc_store.get_document(document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    return FileInfoResponse(
        document_id=doc.document_id,
        filename=doc.filename,
        file_type=doc.file_type.value,
        file_size=doc.file_size,
        extraction_status=doc.extraction_status.value,
        page_count=doc.page_count,
        created_at=doc.created_at,
        text_preview=_text_preview(doc.text),
    )


@router.delete("/{document_id}", response_model=DeleteResponse)
def delete_file(document_id: str, request: Request) -> DeleteResponse:
    """Delete an uploaded document and its stored file."""
    doc_store = request.app.state.document_store
    audit = request.app.state.audit_service

    deleted = doc_store.delete_document(document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found.")

    audit.record(
        task="file_delete",
        selected_model="none",
        execution_status="success",
        metadata={"document_id": document_id},
    )

    return DeleteResponse(deleted=True, document_id=document_id)
