"""
Plain text document processor.

Reads a ``.txt`` file and wraps it in a normalized ``Document``
with a single page.
"""

from __future__ import annotations

import logging
from pathlib import Path

from app.documents.models import (
    Document,
    DocumentMetadata,
    DocumentPage,
    ExtractionStatus,
    FileType,
)
from app.documents.processor import DocumentProcessor, ProcessingError

logger = logging.getLogger(__name__)


class TxtProcessor(DocumentProcessor):
    """Processor for plain-text files."""

    @property
    def supported_extensions(self) -> list[str]:
        return ["txt"]

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
            text = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            try:
                text = file_path.read_text(encoding="latin-1")
            except Exception as exc:
                raise ProcessingError(
                    f"Cannot decode text file '{file_path.name}': {exc}"
                ) from exc

        if len(text) > max_characters:
            text = text[:max_characters]

        page = DocumentPage(
            page_number=1,
            text=text,
            source="text_extraction",
        )

        return Document(
            document_id=document_id,
            filename=file_path.name,
            file_type=FileType.TXT,
            file_size=file_size,
            page_count=1,
            extraction_status=ExtractionStatus.TEXT_EXTRACTED,
            text=text,
            pages=[page],
            metadata=DocumentMetadata(
                original_filename=file_path.name,
                stored_filename=file_path.name,
                mime_type="text/plain",
                encoding="utf-8",
            ),
        )
