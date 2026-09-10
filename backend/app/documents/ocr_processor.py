"""
Local OCR processor.

Uses Tesseract (via ``pytesseract``) and ``pdf2image`` (via poppler)
to perform page-level OCR on scanned PDF documents.

This processor is designed to be called on documents whose
``extraction_status`` is ``OCR_REQUIRED``.  It converts each PDF page
to an image, runs Tesseract OCR, and updates the Document to
``OCR_COMPLETED``.

All processing is completely local — no cloud OCR API is used.

Dependencies:
    - ``tesseract`` system binary (``tesseract-ocr`` package)
    - ``pytesseract`` Python binding
    - ``pdf2image`` (requires ``poppler-utils`` / ``pdftoppm``)
    - ``Pillow``

If these dependencies are missing, ``OcrProcessor.is_available()``
returns ``False`` and ``process()`` raises ``OcrUnavailableError``.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

from app.documents.models import (
    Document,
    DocumentPage,
    ExtractionStatus,
)

logger = logging.getLogger(__name__)


class OcrUnavailableError(Exception):
    """Raised when the OCR engine or its dependencies are not installed."""


class OcrError(Exception):
    """Raised when OCR processing fails."""


def _check_tesseract() -> bool:
    """Return True if the tesseract binary is on PATH."""
    return shutil.which("tesseract") is not None


def _check_pdftoppm() -> bool:
    """Return True if pdftoppm (poppler) is on PATH."""
    return shutil.which("pdftoppm") is not None


class OcrProcessor:
    """Local OCR processor using Tesseract + pdf2image.

    This class is **not** a ``DocumentProcessor`` subclass because it
    doesn't create documents from scratch — it enriches existing
    documents that have ``ExtractionStatus.OCR_REQUIRED``.

    Usage::

        ocr = OcrProcessor()
        if ocr.is_available():
            updated_doc = ocr.ocr_document(document, pdf_path)
    """

    def __init__(self, *, dpi: int = 300) -> None:
        self._dpi = dpi

    @staticmethod
    def is_available() -> bool:
        """Check whether Tesseract and poppler are installed."""
        return _check_tesseract() and _check_pdftoppm()

    def ocr_pdf(
        self,
        pdf_path: Path,
        *,
        max_pages: int = 200,
        max_characters: int = 500_000,
    ) -> list[DocumentPage]:
        """Run OCR on a PDF file and return a list of DocumentPages.

        Args:
            pdf_path:       Path to the PDF file.
            max_pages:      Maximum pages to OCR.
            max_characters: Maximum total characters to extract.

        Returns:
            List of ``DocumentPage`` with ``source="ocr"``.

        Raises:
            OcrUnavailableError: If Tesseract/poppler is not installed.
            OcrError: On processing failure.
        """
        if not self.is_available():
            raise OcrUnavailableError(
                "Tesseract OCR and/or poppler (pdftoppm) are not installed. "
                "Install tesseract-ocr and poppler-utils."
            )

        try:
            import pytesseract
            from pdf2image import convert_from_path
        except ImportError as exc:
            raise OcrUnavailableError(
                f"Required Python package not installed: {exc}"
            ) from exc

        try:
            images = convert_from_path(
                str(pdf_path),
                dpi=self._dpi,
                last_page=max_pages,
            )
        except Exception as exc:
            raise OcrError(
                f"Failed to convert PDF to images: {exc}"
            ) from exc

        pages: list[DocumentPage] = []
        total_chars = 0

        for i, image in enumerate(images):
            if total_chars >= max_characters:
                break

            try:
                # pytesseract.image_to_data gives per-word confidence
                # but image_to_string is simpler for full-page text
                page_text = pytesseract.image_to_string(image).strip()
            except Exception as exc:
                logger.warning("OCR failed on page %d: %s", i + 1, exc)
                pages.append(DocumentPage(
                    page_number=i + 1,
                    text="",
                    source="ocr",
                    confidence=None,
                ))
                continue

            remaining = max_characters - total_chars
            if len(page_text) > remaining:
                page_text = page_text[:remaining]

            total_chars += len(page_text)

            # Get per-page confidence from pytesseract data output
            confidence = self._page_confidence(image, pytesseract)

            pages.append(DocumentPage(
                page_number=i + 1,
                text=page_text,
                source="ocr",
                confidence=confidence,
            ))

        return pages

    def ocr_document(
        self,
        document: Document,
        pdf_path: Path,
        *,
        max_pages: int = 200,
        max_characters: int = 500_000,
    ) -> Document:
        """Run OCR on a document and return an updated copy.

        Only processes documents with ``OCR_REQUIRED`` status.

        Args:
            document:       The Document to OCR.
            pdf_path:       Path to the source PDF.
            max_pages:      Maximum pages to process.
            max_characters: Maximum total characters.

        Returns:
            A new ``Document`` with OCR text and updated status.
        """
        if document.extraction_status != ExtractionStatus.OCR_REQUIRED:
            return document

        try:
            pages = self.ocr_pdf(
                pdf_path,
                max_pages=max_pages,
                max_characters=max_characters,
            )
        except (OcrUnavailableError, OcrError) as exc:
            return document.model_copy(
                update={
                    "extraction_status": ExtractionStatus.FAILED,
                    "metadata": document.metadata.model_copy(
                        update={"extra": {
                            **document.metadata.extra,
                            "ocr_error": str(exc),
                        }}
                    ),
                }
            )

        full_text = "\n\n".join(p.text for p in pages if p.text)
        has_text = bool(full_text.strip())

        return document.model_copy(
            update={
                "pages": pages,
                "page_count": len(pages),
                "text": full_text,
                "extraction_status": (
                    ExtractionStatus.OCR_COMPLETED if has_text
                    else ExtractionStatus.FAILED
                ),
            }
        )

    @staticmethod
    def _page_confidence(image, pytesseract_mod) -> float | None:
        """Compute mean OCR confidence for a page image.

        Returns None if confidence cannot be determined.
        """
        try:
            data = pytesseract_mod.image_to_data(
                image, output_type=pytesseract_mod.Output.DICT
            )
            confidences = [
                int(c) for c in data.get("conf", [])
                if str(c).lstrip("-").isdigit() and int(c) >= 0
            ]
            if not confidences:
                return None
            return round(sum(confidences) / len(confidences) / 100.0, 3)
        except Exception:
            return None
