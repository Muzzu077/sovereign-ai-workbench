"""
Agent API routes.

Exposes the agentic task execution pipeline via REST endpoints.
"""

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Request

from app.agents.orchestrator import AgentOrchestrator, OrchestratorResult

router = APIRouter(prefix="/agent", tags=["agent"])


class AgentRunRequest(BaseModel):
    """Request body for POST /agent/run."""

    task: str


class AgentRunResponse(BaseModel):
    """Response body for POST /agent/run."""

    task: str
    selected_model: str
    provider: str
    result: str
    execution_status: str


@router.post("/run", response_model=AgentRunResponse)
def run_agent(body: AgentRunRequest, request: Request) -> AgentRunResponse:
    """
    Execute a task through the agent orchestrator.

    Accepts a natural-language task, routes it through the orchestrator,
    and returns a structured result including the model used and status.
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
        task=result.task,
        selected_model=result.selected_model,
        provider=result.provider,
        result=result.result,
        execution_status=result.execution_status,
    )
