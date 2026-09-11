"""
File reader tool.

Reads local files and extracts text content. Supports:

- TXT  — plain text
- PDF  — text-layer extraction via pypdf
- DOCX — paragraph extraction via python-docx

Security:
- Validates that the resolved path is within the configured
  workspace directory (prevents path traversal).
- Rejects unsupported file extensions.
- Does NOT implement OCR. For scanned PDFs where no text layer
  exists, returns ``status="ocr_required"``.

The workspace root is passed at construction time and must be
an absolute path.
"""

import logging
from pathlib import Path
from typing import Any

from app.tools.base import Tool, ToolResult

logger = logging.getLogger(__name__)


class FileReaderTool(Tool):
    """Read and extract text from local files within a workspace.

    Args:
        workspace_root: Absolute path to the allowed workspace directory.
                        All file paths are resolved relative to (or validated
                        against) this root.
    """

    _SUPPORTED_EXTENSIONS = {".txt", ".pdf", ".docx"}

    def __init__(self, workspace_root: str | Path) -> None:
        self._workspace = Path(workspace_root).resolve()
        if not self._workspace.is_dir():
            raise ValueError(
                f"Workspace root does not exist or is not a directory: {self._workspace}"
            )

    @property
    def name(self) -> str:
        return "file_reader"

    @property
    def description(self) -> str:
        return (
            "Read a local file and extract its text content. "
            "Supports TXT, PDF (text-layer), and DOCX. "
            "File path must be within the configured workspace."
        )

    @property
    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": (
                        "Path to the file to read. Can be absolute or "
                        "relative to the workspace root."
                    ),
                }
            },
            "required": ["file_path"],
        }

    # ---------------------------------------------------------------- execute

    def execute(self, tool_input: dict[str, Any]) -> ToolResult:
        """Read a file and return its text content."""
        raw_path = tool_input.get("file_path", "")
        if not isinstance(raw_path, str) or not raw_path.strip():
            return ToolResult(success=False, error="file_path must be a non-empty string.")

        # Resolve the path
        requested = Path(raw_path.strip())
        if not requested.is_absolute():
            resolved = (self._workspace / requested).resolve()
        else:
            resolved = requested.resolve()

        # --- Security: path traversal check ---
        try:
            resolved.relative_to(self._workspace)
        except ValueError:
            return ToolResult(
                success=False,
                error=(
                    f"Access denied: '{raw_path}' resolves outside the "
                    f"workspace ({self._workspace})."
                ),
            )

        # --- File existence ---
        if not resolved.is_file():
            return ToolResult(
                success=False,
                error=f"File not found: {resolved}",
            )

        # --- Extension check ---
        ext = resolved.suffix.lower()
        if ext not in self._SUPPORTED_EXTENSIONS:
            return ToolResult(
                success=False,
                error=(
                    f"Unsupported file extension: '{ext}'. "
                    f"Supported: {', '.join(sorted(self._SUPPORTED_EXTENSIONS))}"
                ),
            )

        # --- Dispatch by type ---
        try:
            if ext == ".txt":
                return self._read_txt(resolved)
            elif ext == ".pdf":
                return self._read_pdf(resolved)
            elif ext == ".docx":
                return self._read_docx(resolved)
        except Exception as exc:
            logger.exception("Failed to read file %s", resolved)
            return ToolResult(
                success=False,
                error=f"Error reading file: {exc}",
            )

        # Should not reach here, but guard anyway.
        return ToolResult(success=False, error=f"Unhandled extension: {ext}")

    # --------------------------------------------------------------- readers

    def _read_txt(self, path: Path) -> ToolResult:
        text = path.read_text(encoding="utf-8", errors="replace")
        return ToolResult(
            success=True,
            result=text,
            metadata={"file_path": str(path), "extension": ".txt", "length": len(text)},
        )

    def _read_pdf(self, path: Path) -> ToolResult:
        try:
            from pypdf import PdfReader
        except ImportError:
            return ToolResult(
                success=False,
                error="pypdf is not installed. Install it with: pip install pypdf",
            )

        reader = PdfReader(str(path))
        pages_text: list[str] = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            pages_text.append(text)

        full_text = "\n".join(pages_text).strip()

        if not full_text:
            # No text layer — likely a scanned PDF.
            return ToolResult(
                success=True,
                result="",
                metadata={
                    "file_path": str(path),
                    "extension": ".pdf",
                    "pages": len(reader.pages),
                    "status": "ocr_required",
                    "note": (
                        "No extractable text found. This PDF appears to be "
                        "scanned. OCR is required but not implemented in this phase."
                    ),
                },
            )

        return ToolResult(
            success=True,
            result=full_text,
            metadata={
                "file_path": str(path),
                "extension": ".pdf",
                "pages": len(reader.pages),
                "length": len(full_text),
                "status": "text_extracted",
            },
        )

    def _read_docx(self, path: Path) -> ToolResult:
        try:
            import docx
        except ImportError:
            return ToolResult(
                success=False,
                error="python-docx is not installed. Install it with: pip install python-docx",
            )

        doc = docx.Document(str(path))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        full_text = "\n".join(paragraphs)

        return ToolResult(
            success=True,
            result=full_text,
            metadata={
                "file_path": str(path),
                "extension": ".docx",
                "paragraphs": len(paragraphs),
                "length": len(full_text),
            },
        )
