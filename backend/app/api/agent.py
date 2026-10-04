"""
Agent API routes.

Exposes the agentic task execution pipeline via REST endpoints.

    POST /agent/run    — synchronous execution, returns full result
    POST /agent/stream — SSE streaming, emits trace events in real time
"""

import asyncio
import json
from typing import Any, AsyncIterator

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.agents.orchestrator import AgentOrchestrator, OrchestratorResult

router = APIRouter(prefix="/agent", tags=["agent"])


class AgentRunRequest(BaseModel):
    """Request body for POST /agent/run."""

    task: str
    model: str | None = None


class AgentRunResponse(BaseModel):
    """Response body for POST /agent/run.

    Includes routing, planning, tool execution, verification,
    and the final LLM-generated result.
    """

    run_id: str = ""
    task: str
    task_type: str = "general"
    selected_model: str
    provider: str
    execution_status: str
    plan: list[dict[str, Any]] = []
    tool_calls: list[dict[str, Any]] = []
    verification: dict[str, Any] = {}
    result: str
    trace: list[dict[str, Any]] = []


@router.post("/run", response_model=AgentRunResponse)
def run_agent(body: AgentRunRequest, request: Request) -> AgentRunResponse:
    """
    Execute a task through the agent orchestrator.

    Accepts a natural-language task, routes it through the full
    agent pipeline (router -> planner -> executor -> verifier -> LLM),
    and returns a structured result.
    """
    orchestrator: AgentOrchestrator | None = getattr(
        request.app.state, "orchestrator", None
    )
    if orchestrator is None:
        raise HTTPException(
            status_code=503,
            detail="Agent orchestrator is not initialized.",
        )

    if not body.task.strip():
        raise HTTPException(
            status_code=422,
            detail="Task must not be empty.",
        )

    result: OrchestratorResult = orchestrator.run(body.task, model_name=body.model)

    return AgentRunResponse(
        run_id=result.run_id,
        task=result.task,
        task_type=result.task_type,
        selected_model=result.selected_model,
        provider=result.provider,
        execution_status=result.execution_status,
        plan=result.plan,
        tool_calls=result.tool_calls,
        verification=result.verification,
        result=result.result,
        trace=result.trace,
    )


@router.post("/stream")
async def stream_agent(
    body: AgentRunRequest, request: Request,
) -> StreamingResponse:
    """Stream agent execution trace events via SSE.

    Emits events:
        trace  — individual execution trace events (TASK_RECEIVED, TASK_ROUTED,
                 PLAN_CREATED, TOOL_STARTED, TOOL_COMPLETED, etc.)
        result — final OrchestratorResult with full execution details
        error  — error details if the pipeline fails

    The frontend can display each trace event incrementally to show
    real-time agent execution progress.
    """
    orchestrator: AgentOrchestrator | None = getattr(
        request.app.state, "orchestrator", None
    )
    if orchestrator is None:
        raise HTTPException(
            status_code=503,
            detail="Agent orchestrator is not initialized.",
        )

    if not body.task.strip():
        raise HTTPException(
            status_code=422,
            detail="Task must not be empty.",
        )

    async def event_stream() -> AsyncIterator[str]:
        loop = asyncio.get_running_loop()

        # Run the synchronous generator in a thread executor
        def _run_pipeline():
            return list(orchestrator.run_streaming(
                body.task, model_name=body.model,
            ))

        events = await loop.run_in_executor(None, _run_pipeline)

        for event in events:
            event_type = event.get("event", "trace")
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
