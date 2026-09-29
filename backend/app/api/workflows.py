"""
Approval-note workflow routes.

    POST /workflows/approval-note                        — run the pipeline
    GET  /workflows/approval-note/{document_id}/download — stream the DOCX
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, UploadFile, Form
from fastapi.responses import Response

from app.services.approval_workflow import ApprovalNoteResult

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workflows", tags=["workflows"])

_DOCX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


@router.post("/approval-note", response_model=ApprovalNoteResult)
async def create_approval_note(
    request: Request,
    document_id: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    instructions: Optional[str] = Form(None),
) -> ApprovalNoteResult:
    """Run the RAG → findings → note → DOCX pipeline."""
    if not document_id:
        raise HTTPException(
            status_code=422, detail="document_id is required.",
        )

    workflow = getattr(request.app.state, "approval_workflow", None)
    if workflow is None:
        raise HTTPException(
            status_code=503,
            detail="Approval-note workflow is not initialised.",
        )

    try:
        return workflow.run(
            document_id=document_id,
            title=title,
            instructions=instructions,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/approval-note/{document_id}/download")
def download_approval_note(
    document_id: str, request: Request,
) -> Response:
    """Stream the generated approval-note DOCX for a document."""
    workflow = getattr(request.app.state, "approval_workflow", None)
    if workflow is None:
        raise HTTPException(
            status_code=503,
            detail="Approval-note workflow is not initialised.",
        )

    path = workflow.artifact_path(document_id)
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="No approval note found for this document.",
        )

    content = path.read_bytes()
    return Response(
        content=content,
        media_type=_DOCX_MEDIA_TYPE,
        headers={
            "Content-Disposition": 'attachment; filename="approval_note.docx"',
            "Content-Length": str(len(content)),
        },
    )
