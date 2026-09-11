"""
Agent API routes.

Exposes the agentic task execution pipeline via REST endpoints.
"""

from typing import Any

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Request

from app.agents.orchestrator import AgentOrchestrator, OrchestratorResult

router = APIRouter(prefix="/agent", tags=["agent"])


class AgentRunRequest(BaseModel):
    """Request body for POST /agent/run."""

    task: str


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

    result: OrchestratorResult = orchestrator.run(body.task)

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
    )
