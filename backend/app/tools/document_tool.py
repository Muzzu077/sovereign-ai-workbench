"""
Document generation tool for the agent system.

Provides document generation capabilities — converts markdown content
to DOCX format using the ExportService. This tool wraps the existing
export service to make it available as an agent tool.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Any

from app.tools.base import Tool, ToolResult
from app.services.export_service import ExportService

logger = logging.getLogger(__name__)


class DocumentGenerationTool(Tool):
    """Agent tool for generating DOCX documents from markdown content.

    Uses the local ExportService for real markdown-to-DOCX conversion
    with professional styling. No cloud services used.

    Args:
        outputs_dir: Directory where generated documents are saved.
        export_service: Optional ExportService instance (creates one if not provided).
    """

    def __init__(
        self,
        outputs_dir: str | Path,
        *,
        export_service: ExportService | None = None,
    ) -> None:
        self._outputs_dir = Path(outputs_dir).resolve()
        self._outputs_dir.mkdir(parents=True, exist_ok=True)
        self._export = export_service or ExportService()

    @property
    def name(self) -> str:
        return "document_generator"

    @property
    def description(self) -> str:
        return (
            "Generate a professionally formatted DOCX document from markdown "
            "content. Input: title (document title) and content (markdown text). "
            "Returns the path to the generated .docx file."
        )

    @property
    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Title for the document.",
                },
                "content": {
                    "type": "string",
                    "description": "Markdown content to convert to DOCX.",
                },
                "filename": {
                    "type": "string",
                    "description": (
                        "Optional output filename (without extension). "
                        "If not provided, a UUID-based name is generated."
                    ),
                },
            },
            "required": ["title", "content"],
        }

    def execute(self, tool_input: dict[str, Any]) -> ToolResult:
        """Generate a DOCX document from markdown content."""
        title = tool_input.get("title", "")
        content = tool_input.get("content", "")
        filename = tool_input.get("filename", "")

        if not title:
            return ToolResult(
                success=False, error="Missing required parameter: title"
            )
        if not content:
            return ToolResult(
                success=False, error="Missing required parameter: content"
            )

        # Generate filename
        if not filename:
            safe_title = "".join(
                c if c.isalnum() or c in " -_" else "_" for c in title
            )[:50]
            filename = f"{safe_title}_{uuid.uuid4().hex[:8]}"

        filename = filename.replace("/", "_").replace("\\", "_").replace("..", "_")
        output_path = self._outputs_dir / f"{filename}.docx"

        try:
            docx_bytes = self._export.markdown_to_docx(title, content)
            output_path.write_bytes(docx_bytes)
        except Exception as exc:
            logger.exception("Document generation failed: %s", exc)
            return ToolResult(
                success=False,
                error=f"Document generation failed: {exc}",
            )

        return ToolResult(
            success=True,
            result=f"Document generated: {output_path.name}",
            metadata={
                "path": str(output_path),
                "filename": output_path.name,
                "size_bytes": len(docx_bytes),
                "title": title,
            },
        )
