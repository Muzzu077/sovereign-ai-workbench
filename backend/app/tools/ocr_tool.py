"""
OCR tool for the agent system.

Provides OCR capabilities for scanned PDF documents using local
Tesseract OCR engine. This tool wraps the existing OcrProcessor
service to make it available as an agent tool.

Dependencies:
    - tesseract-ocr system package
    - pytesseract Python binding
    - pdf2image (requires poppler-utils)
    - Pillow
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.tools.base import Tool, ToolResult
from app.documents.ocr_processor import OcrProcessor, OcrUnavailableError, OcrError

logger = logging.getLogger(__name__)


class OCRTool(Tool):
    """Agent tool for performing OCR on scanned PDF documents.

    Uses the local Tesseract OCR engine via the OcrProcessor service.
    All processing is completely local — no cloud OCR API is used.

    Args:
        workspace_root: Absolute path to the workspace containing documents.
        dpi: Resolution for PDF-to-image conversion (default 300).
    """

    def __init__(
        self,
        workspace_root: str | Path,
        *,
        dpi: int = 300,
    ) -> None:
        self._workspace = Path(workspace_root).resolve()
        self._processor = OcrProcessor(dpi=dpi)

    @property
    def name(self) -> str:
        return "ocr"

    @property
    def description(self) -> str:
        return (
            "Perform OCR (Optical Character Recognition) on a scanned PDF "
            "document. Extracts text from image-based pages using local "
            "Tesseract engine. Input: file_path (relative to workspace). "
            "Returns extracted text with page numbers and confidence scores."
        )

    @property
    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": (
                        "Path to the scanned PDF file, relative to the "
                        "workspace root."
                    ),
                },
                "max_pages": {
                    "type": "integer",
                    "description": "Maximum number of pages to OCR (default 50).",
                    "default": 50,
                },
            },
            "required": ["file_path"],
        }

    def execute(self, tool_input: dict[str, Any]) -> ToolResult:
        """Run OCR on a PDF file and return extracted text."""
        file_path_str = tool_input.get("file_path", "")
        max_pages = int(tool_input.get("max_pages", 50))

        if not file_path_str:
            return ToolResult(
                success=False, error="Missing required parameter: file_path"
            )

        # Resolve and validate path within workspace
        resolved = (self._workspace / file_path_str).resolve()
        if not str(resolved).startswith(str(self._workspace)):
            return ToolResult(
                success=False,
                error="Path traversal rejected: file must be within workspace.",
            )

        if not resolved.exists():
            return ToolResult(
                success=False,
                error=f"File not found: {file_path_str}",
            )

        if resolved.suffix.lower() != ".pdf":
            return ToolResult(
                success=False,
                error="OCR tool only supports PDF files.",
            )

        # Check OCR availability
        if not self._processor.is_available():
            return ToolResult(
                success=False,
                error=(
                    "OCR engine unavailable. Install tesseract-ocr and "
                    "poppler-utils system packages."
                ),
                metadata={"tesseract_available": False},
            )

        try:
            pages = self._processor.ocr_pdf(
                resolved, max_pages=max_pages, max_characters=500_000,
            )
        except OcrUnavailableError as exc:
            return ToolResult(success=False, error=str(exc))
        except OcrError as exc:
            return ToolResult(success=False, error=f"OCR processing failed: {exc}")

        # Build result
        full_text = "\n\n".join(p.text for p in pages if p.text)
        page_details = [
            {
                "page": p.page_number,
                "chars": len(p.text),
                "confidence": p.confidence,
                "has_text": bool(p.text.strip()),
            }
            for p in pages
        ]

        avg_confidence = None
        conf_values = [p.confidence for p in pages if p.confidence is not None]
        if conf_values:
            avg_confidence = round(sum(conf_values) / len(conf_values), 3)

        return ToolResult(
            success=True,
            result=full_text,
            metadata={
                "file": file_path_str,
                "pages_processed": len(pages),
                "total_characters": len(full_text),
                "average_confidence": avg_confidence,
                "page_details": page_details,
            },
        )
