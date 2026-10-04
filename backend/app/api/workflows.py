"""
Approval-note workflow routes.

    POST /workflows/approval-note                        — run the pipeline (sync)
    POST /workflows/approval-note/stream                 — run with SSE stage events
    GET  /workflows/approval-note/{document_id}/download — stream the DOCX
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncIterator, Optional

from fastapi import APIRouter, HTTPException, Request, UploadFile, Form
from fastapi.responses import Response, StreamingResponse

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


@router.post("/approval-note/stream")
async def stream_approval_note(
    request: Request,
    document_id: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    instructions: Optional[str] = Form(None),
) -> StreamingResponse:
    """Run the approval-note pipeline with SSE stage-by-stage streaming.

    Emits events: stage, citations, findings, note, complete, error.
    Each event contains a JSON payload with progress details.
    """
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

    async def event_stream() -> AsyncIterator[str]:
        loop = asyncio.get_running_loop()

        # Run the synchronous generator in a thread executor and
        # yield SSE events as they arrive
        def _run_pipeline():
            return list(workflow.run_streaming(
                document_id=document_id,
                title=title,
                instructions=instructions,
            ))

        events = await loop.run_in_executor(None, _run_pipeline)

        for event in events:
            event_type = event.get("event", "stage")
            data = event.get("data", {})
            yield (
                f"event: {event_type}\n"
                f"data: {json.dumps(data)}\n\n"
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


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
