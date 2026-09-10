"""
Document domain models.

Clean Pydantic models representing the normalized document structure.
All documents — regardless of original format (TXT, PDF, DOCX) — are
converted into this representation after extraction.
"""

from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class ExtractionStatus(str, enum.Enum):
    """Status of the text extraction process for a document."""

    TEXT_EXTRACTED = "TEXT_EXTRACTED"
    OCR_REQUIRED = "OCR_REQUIRED"
    OCR_COMPLETED = "OCR_COMPLETED"
    FAILED = "FAILED"
    UNSUPPORTED = "UNSUPPORTED"


class FileType(str, enum.Enum):
    """Supported document file types."""

    TXT = "txt"
    PDF = "pdf"
    DOCX = "docx"


class DocumentPage(BaseModel):
    """A single page of extracted content.

    Attributes:
        page_number: 1-based page index.
        text:        Extracted text content for this page.
        source:      How the text was obtained (e.g. ``"text_extraction"``,
                     ``"ocr"``).
        confidence:  OCR confidence score (0.0–1.0) when available.
                     ``None`` when not applicable or not measurable.
    """

    page_number: int
    text: str
    source: str = "text_extraction"
    confidence: float | None = None


class DocumentMetadata(BaseModel):
    """Supplementary metadata attached to a document.

    Attributes:
        original_filename: The name the user uploaded.
        stored_filename:   The sanitized name on disk.
        mime_type:         Detected MIME type.
        encoding:          Character encoding (for TXT files).
        author:            Document author (from DOCX metadata, etc.).
        title:             Document title (from DOCX metadata, etc.).
        extra:             Catch-all for format-specific metadata.
    """

    original_filename: str = ""
    stored_filename: str = ""
    mime_type: str = ""
    encoding: str | None = None
    author: str | None = None
    title: str | None = None
    extra: dict[str, Any] = {}


class Document(BaseModel):
    """Normalized document representation.

    Every uploaded file is converted into this model after processing.
    The ``pages`` list preserves page boundaries for multi-page documents.
    For single-page formats (TXT), there is one page entry.

    Attributes:
        document_id:       Unique identifier (UUID).
        filename:          Original filename as uploaded.
        file_type:         One of the supported ``FileType`` values.
        file_size:         Size of the original file in bytes.
        page_count:        Number of pages extracted.
        extraction_status: Current extraction status.
        text:              Full concatenated text from all pages.
        pages:             List of ``DocumentPage`` with per-page content.
        metadata:          Additional metadata about the document.
        created_at:        Timestamp of document creation (UTC ISO string).
    """

    document_id: str
    filename: str
    file_type: FileType
    file_size: int
    page_count: int = 0
    extraction_status: ExtractionStatus = ExtractionStatus.FAILED
    text: str = ""
    pages: list[DocumentPage] = []
    metadata: DocumentMetadata = Field(default_factory=DocumentMetadata)
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
