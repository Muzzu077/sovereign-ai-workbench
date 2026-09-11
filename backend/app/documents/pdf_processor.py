"""
PDF document processor.

Uses ``pypdf`` to extract text from each page.  If a page yields no
extractable text it is marked as requiring OCR.  The processor itself
does **not** perform OCR — it sets ``ExtractionStatus.OCR_REQUIRED``
so the caller (or a separate OCR processor) can handle it.
"""

from __future__ import annotations

import logging
from pathlib import Path

from pypdf import PdfReader

from app.documents.models import (
    Document,
    DocumentMetadata,
    DocumentPage,
    ExtractionStatus,
    FileType,
)
from app.documents.processor import DocumentProcessor, ProcessingError

logger = logging.getLogger(__name__)


class PdfProcessor(DocumentProcessor):
    """Processor for PDF files using pypdf."""

    @property
    def supported_extensions(self) -> list[str]:
        return ["pdf"]

    def process(
        self,
        file_path: Path,
        document_id: str,
        *,
        max_pages: int = 200,
        max_characters: int = 500_000,
    ) -> Document:
        if not file_path.exists():
            raise ProcessingError(f"File not found: {file_path.name}")

        file_size = file_path.stat().st_size

        try:
            reader = PdfReader(str(file_path))
        except Exception as exc:
            raise ProcessingError(
                f"Cannot read PDF '{file_path.name}': {exc}"
            ) from exc

        total_pages = len(reader.pages)
        pages_to_process = min(total_pages, max_pages)

        pages: list[DocumentPage] = []
        all_text_parts: list[str] = []
        total_chars = 0
        has_text = False
        pages_without_text = 0

        for i in range(pages_to_process):
            try:
                page_text = reader.pages[i].extract_text() or ""
            except Exception:
                page_text = ""

            page_text = page_text.strip()

            if page_text:
                has_text = True
                remaining = max_characters - total_chars
                if remaining <= 0:
                    break
                if len(page_text) > remaining:
                    page_text = page_text[:remaining]

                total_chars += len(page_text)
                all_text_parts.append(page_text)

                pages.append(DocumentPage(
                    page_number=i + 1,
                    text=page_text,
                    source="text_extraction",
                ))
            else:
                pages_without_text += 1
                pages.append(DocumentPage(
                    page_number=i + 1,
                    text="",
                    source="no_text_found",
                ))

        full_text = "\n\n".join(all_text_parts)

        # Determine extraction status
        if not has_text:
            status = ExtractionStatus.OCR_REQUIRED
        elif pages_without_text > 0:
            # Some pages had text, some didn't — partially extracted
            status = ExtractionStatus.TEXT_EXTRACTED
        else:
            status = ExtractionStatus.TEXT_EXTRACTED

        # Extract PDF metadata
        pdf_meta = reader.metadata or {}
        author = getattr(pdf_meta, "author", None)
        title = getattr(pdf_meta, "title", None)

        return Document(
            document_id=document_id,
            filename=file_path.name,
            file_type=FileType.PDF,
            file_size=file_size,
            page_count=pages_to_process,
            extraction_status=status,
            text=full_text,
            pages=pages,
            metadata=DocumentMetadata(
                original_filename=file_path.name,
                stored_filename=file_path.name,
                mime_type="application/pdf",
                author=author,
                title=title,
                extra={
                    "total_pages_in_file": total_pages,
                    "pages_processed": pages_to_process,
                    "pages_without_text": pages_without_text,
                },
            ),
        )
