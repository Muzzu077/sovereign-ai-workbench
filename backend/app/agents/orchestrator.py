"""
Agent orchestrator.

Coordinates task execution: receives a user task, selects the
appropriate model via the registry, invokes the model, records
an audit entry, and returns a structured result.

In future phases this will support multi-step agentic workflows
with planning, tool use, and feedback loops.
"""

from pydantic import BaseModel

from app.models.base import GenerationRequest
from app.models.registry import ModelRegistry
from app.security.audit import AuditService


class OrchestratorResult(BaseModel):
    """Structured result returned by the orchestrator."""

    task: str
    selected_model: str
    provider: str = ""
    result: str
    execution_status: str


class AgentOrchestrator:
    """
    Top-level orchestrator for agentic task execution.

    Current behaviour:
    1. Accept a task string.
    2. Select the configured model from the registry.
    3. Call the model's generate method.
    4. Log an audit record (including provider information).
    5. Return a structured result.

    Future behaviour will include planning, tool selection,
    multi-step execution, and autonomous reasoning loops.
    """

    def __init__(
        self,
        registry: ModelRegistry,
        audit_service: AuditService,
        default_model: str = "general",
    ) -> None:
        self._registry = registry
        self._audit = audit_service
        self._default_model = default_model

    def run(self, task: str) -> OrchestratorResult:
        """
        Execute a task end-to-end.

        Args:
            task: Natural-language description of the task.

        Returns:
            OrchestratorResult with task, model used, provider, output,
            and status.
        """
        model_name = self._default_model
        try:
            provider = self._registry.get(model_name)
        except KeyError as exc:
            self._audit.record(
                task=task,
                selected_model=model_name,
                execution_status="error",
                metadata={"error": str(exc)},
            )
            return OrchestratorResult(
                task=task,
                selected_model=model_name,
                provider="unknown",
                result=f"Model selection failed: {exc}",
                execution_status="error",
            )

        provider_name = provider.get_name()

        # Determine provider type if the implementation exposes it
        provider_type = getattr(provider, "get_provider_type", lambda: "unknown")()

        if not provider.is_available():
            self._audit.record(
                task=task,
                selected_model=model_name,
                execution_status="error",
                metadata={
                    "error": "Model not available",
                    "provider": provider_type,
                    "local_inference": True,
                },
            )
            return OrchestratorResult(
                task=task,
                selected_model=model_name,
                provider=provider_type,
                result="Selected model is not currently available.",
                execution_status="error",
            )

        try:
            request = GenerationRequest(prompt=task)
            response = provider.generate(request)

            self._audit.record(
                task=task,
                selected_model=model_name,
                execution_status="success",
                metadata={
                    "tokens_used": response.tokens_used,
                    "provider": provider_type,
                    "model_name": response.model_name,
                    "local_inference": True,
                },
            )

            return OrchestratorResult(
                task=task,
                selected_model=model_name,
                provider=provider_type,
                result=response.text,
                execution_status="success",
            )
        except Exception as exc:
            self._audit.record(
                task=task,
                selected_model=model_name,
                execution_status="error",
                metadata={
                    "error": str(exc),
                    "provider": provider_type,
                    "local_inference": True,
                },
            )
            return OrchestratorResult(
                task=task,
                selected_model=model_name,
                provider=provider_type,
                result=f"Execution failed: {exc}",
                execution_status="error",
            )
