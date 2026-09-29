"""
Studio API — export artifacts to DOCX.

    POST /studio/export — convert markdown to DOCX and return as download.
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.services.export_service import ExportService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/studio", tags=["studio"])

_export_service = ExportService()


class ExportRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=256, description="Document title")
    content: str = Field(..., min_length=1, description="Markdown content to convert")
    format: Literal["docx"] = Field(
        default="docx", description="Export format (docx only for now)"
    )


@router.post(
    "/export",
    summary="Export a markdown artifact to DOCX",
    response_description="Binary DOCX file",
)
def export_studio_note(req: ExportRequest) -> Response:
    """Convert markdown content to a styled DOCX document.

    The conversion runs entirely on-premise using python-docx.
    """
    logger.info(
        "Studio export requested: title='%s', format=%s", req.title, req.format,
    )

    docx_bytes = _export_service.markdown_to_docx(req.title, req.content)

    safe_title = "".join(
        c if c.isalnum() or c in " _-" else "_" for c in req.title
    ).strip()
    filename = f"{safe_title or 'studio_artifact'}.docx"

    return Response(
        content=docx_bytes,
        media_type=(
            "application/vnd.openxmlformats-officedocument"
            ".wordprocessingml.document"
        ),
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(docx_bytes)),
        },
    )
