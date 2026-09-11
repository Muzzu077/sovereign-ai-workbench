"""
Agent orchestrator.

Coordinates the full controlled agent execution pipeline:

    Task → Router → Planner → Executor → Verifier → Gemma → Result

Components:
    TaskRouter       — deterministic task classification
    TaskPlanner      — structured execution plan
    AgentExecutor    — sequential tool execution
    VerifierRegistry — independent result verification
    ModelRegistry    — LLM provider resolution
    AuditService     — JSON-lines audit persistence
    ExecutionTrace   — fine-grained event recording

The orchestrator does NOT let the model execute tools directly.
All tool execution is controlled by the application through
the AgentExecutor and ToolRegistry.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.agents.executor import AgentExecutor, ExecutionResult, StepOutcome
from app.agents.planner import TaskPlanner, ExecutionPlan
from app.agents.router import TaskRouter, RouteResult
from app.agents.trace import ExecutionTrace, EventType
from app.agents.verifier import VerifierRegistry
from app.models.base import GenerationRequest
from app.models.registry import ModelRegistry
from app.security.audit import AuditService
from app.tools.registry import ToolRegistry


class OrchestratorResult(BaseModel):
    """Structured result returned by the orchestrator.

    This is the full response for ``POST /agent/run``, including
    routing, planning, tool execution, verification, and the
    final LLM-generated response.
    """

    run_id: str = ""
    task: str
    task_type: str = "general"
    selected_model: str
    provider: str = ""
    execution_status: str
    plan: list[dict[str, Any]] = []
    tool_calls: list[dict[str, Any]] = []
    verification: dict[str, Any] = {}
    result: str
    trace: list[dict[str, Any]] = []


class AgentOrchestrator:
    """Top-level orchestrator for controlled agent execution.

    Coordinates:
    1. TaskRouter     — classify the task
    2. TaskPlanner    — produce an ExecutionPlan
    3. AgentExecutor  — run tools sequentially
    4. Verifier       — verify tool results
    5. ModelRegistry  — LLM final response generation
    6. AuditService   — record the run

    Args:
        registry:          Model provider registry.
        audit_service:     Audit persistence service.
        tool_registry:     Optional tool registry (None = no tools).
        verifier_registry: Optional verifier registry.
        default_model:     Registry key for the default model.
    """

    def __init__(
        self,
        registry: ModelRegistry,
        audit_service: AuditService,
        tool_registry: ToolRegistry | None = None,
        verifier_registry: VerifierRegistry | None = None,
        default_model: str = "general",
    ) -> None:
        self._registry = registry
        self._audit = audit_service
        self._tool_registry = tool_registry
        self._verifier_registry = verifier_registry or VerifierRegistry()
        self._default_model = default_model
        self._router = TaskRouter()
        self._planner = (
            TaskPlanner(tool_registry) if tool_registry else None
        )
        self._executor = (
            AgentExecutor(tool_registry, self._verifier_registry)
            if tool_registry
            else None
        )

    def run(self, task: str) -> OrchestratorResult:
        """Execute a task through the full agent pipeline.

        1. Route the task
        2. Plan execution steps
        3. Execute tools
        4. Verify results
        5. Generate final LLM response
        6. Record audit entry

        Args:
            task: Natural-language task description.

        Returns:
            OrchestratorResult with full execution details.
        """
        trace = ExecutionTrace()
        trace.emit(EventType.TASK_RECEIVED, metadata={"task": task[:200]})

        # --- 1. Route ---
        route = self._router.route(task)
        trace.emit(
            EventType.TASK_ROUTED,
            metadata={
                "task_type": route.task_type,
                "tools_hint": route.tools_hint,
            },
        )

        # --- 2. Resolve model ---
        model_name = self._default_model
        try:
            provider = self._registry.get(model_name)
        except KeyError as exc:
            return self._error_result(
                task=task,
                model_name=model_name,
                error=f"Model selection failed: {exc}",
                trace=trace,
                route=route,
            )

        provider_type = getattr(provider, "get_provider_type", lambda: "unknown")()

        # --- 3. Plan ---
        plan: ExecutionPlan | None = None
        exec_result: ExecutionResult | None = None

        if self._planner and route.task_type != "general":
            try:
                plan = self._planner.plan(task, route)
                trace.emit(
                    EventType.PLAN_CREATED,
                    metadata={
                        "steps": len(plan.steps),
                        "tools": [s.tool for s in plan.steps],
                    },
                )
            except Exception as exc:
                return self._error_result(
                    task=task,
                    model_name=model_name,
                    provider_type=provider_type,
                    error=f"Planning failed: {exc}",
                    trace=trace,
                    route=route,
                )

        # --- 4. Execute tools ---
        if plan and plan.steps and self._executor:
            exec_result = self._executor.execute(plan, trace)

            if not exec_result.success:
                trace.emit(
                    EventType.TASK_FAILED,
                    metadata={"error": exec_result.error or "unknown"},
                )
                self._audit.record(
                    task=task,
                    selected_model=model_name,
                    execution_status="error",
                    metadata={
                        "provider": provider_type,
                        "local_inference": True,
                        "task_type": route.task_type,
                        "error": exec_result.error,
                    },
                )
                return OrchestratorResult(
                    run_id=trace.run_id,
                    task=task,
                    task_type=route.task_type,
                    selected_model=model_name,
                    provider=provider_type,
                    execution_status="error",
                    plan=self._plan_to_dicts(plan),
                    tool_calls=self._outcomes_to_dicts(exec_result.outcomes),
                    verification=self._verification_summary(exec_result.outcomes),
                    result=f"Tool execution failed: {exec_result.error}",
                    trace=trace.to_dicts(),
                )

        # --- 5. Generate final LLM response ---
        if not provider.is_available():
            return self._error_result(
                task=task,
                model_name=model_name,
                provider_type=provider_type,
                error="Selected model is not currently available.",
                trace=trace,
                route=route,
                plan=plan,
                exec_result=exec_result,
            )

        try:
            prompt = self._build_final_prompt(task, route, exec_result)
            request = GenerationRequest(prompt=prompt)
            response = provider.generate(request)

            trace.emit(
                EventType.TASK_COMPLETED,
                metadata={
                    "tokens_used": response.tokens_used,
                    "provider": provider_type,
                },
            )

            self._audit.record(
                task=task,
                selected_model=model_name,
                execution_status="success",
                metadata={
                    "tokens_used": response.tokens_used,
                    "provider": provider_type,
                    "model_name": response.model_name,
                    "local_inference": True,
                    "task_type": route.task_type,
                    "tools_used": (
                        [s.tool for s in plan.steps] if plan else []
                    ),
                },
            )

            return OrchestratorResult(
                run_id=trace.run_id,
                task=task,
                task_type=route.task_type,
                selected_model=model_name,
                provider=provider_type,
                execution_status="success",
                plan=self._plan_to_dicts(plan) if plan else [],
                tool_calls=self._outcomes_to_dicts(
                    exec_result.outcomes if exec_result else []
                ),
                verification=self._verification_summary(
                    exec_result.outcomes if exec_result else []
                ),
                result=response.text,
                trace=trace.to_dicts(),
            )

        except Exception as exc:
            trace.emit(
                EventType.TASK_FAILED,
                metadata={"error": str(exc)},
            )
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
                run_id=trace.run_id,
                task=task,
                task_type=route.task_type,
                selected_model=model_name,
                provider=provider_type,
                execution_status="error",
                plan=self._plan_to_dicts(plan) if plan else [],
                tool_calls=self._outcomes_to_dicts(
                    exec_result.outcomes if exec_result else []
                ),
                result=f"Execution failed: {exc}",
                trace=trace.to_dicts(),
            )

    # ---------------------------------------------------------- prompt building

    def _build_final_prompt(
        self,
        task: str,
        route: RouteResult,
        exec_result: ExecutionResult | None,
    ) -> str:
        """Build the prompt for the final LLM response.

        If tools were executed, the prompt includes their results
        so the LLM can synthesize a natural-language answer.
        """
        if not exec_result or not exec_result.outcomes:
            return task

        parts = [
            f"The user asked: {task}\n",
            "The following tool results were obtained:\n",
        ]

        for outcome in exec_result.outcomes:
            parts.append(f"- Tool: {outcome.tool}")
            if outcome.tool_result.success:
                result_str = str(outcome.tool_result.result)
                # Truncate large content to avoid exceeding context window.
                if len(result_str) > 2000:
                    result_str = result_str[:2000] + "... [truncated]"
                parts.append(f"  Result: {result_str}")
            else:
                parts.append(f"  Error: {outcome.tool_result.error}")

            if outcome.verification:
                parts.append(f"  Verification: {outcome.verification.status.value}")

        parts.append(
            "\nBased on these results, provide a clear and concise answer to the user's request."
        )
        return "\n".join(parts)

    # ---------------------------------------------------------- serialization

    @staticmethod
    def _plan_to_dicts(plan: ExecutionPlan | None) -> list[dict[str, Any]]:
        if not plan:
            return []
        return [
            {
                "step_id": s.step_id,
                "tool": s.tool,
                "description": s.description,
                "input": s.input,
            }
            for s in plan.steps
        ]

    @staticmethod
    def _outcomes_to_dicts(
        outcomes: list[StepOutcome],
    ) -> list[dict[str, Any]]:
        result = []
        for o in outcomes:
            entry: dict[str, Any] = {
                "step_id": o.step_id,
                "tool": o.tool,
                "success": o.tool_result.success,
            }
            if o.tool_result.success:
                result_str = str(o.tool_result.result)
                entry["result"] = result_str[:500] if len(result_str) > 500 else result_str
            else:
                entry["error"] = o.tool_result.error
            if o.verification:
                entry["verification"] = o.verification.status.value
            result.append(entry)
        return result

    @staticmethod
    def _verification_summary(outcomes: list[StepOutcome]) -> dict[str, Any]:
        summary: dict[str, Any] = {"verified_steps": 0, "unverified_steps": 0, "failed_steps": 0}
        for o in outcomes:
            if o.verification:
                if o.verification.status.value == "PASS":
                    summary["verified_steps"] += 1
                elif o.verification.status.value == "FAIL":
                    summary["failed_steps"] += 1
                else:
                    summary["unverified_steps"] += 1
        return summary

    # ---------------------------------------------------------- error helper

    def _error_result(
        self,
        task: str,
        model_name: str,
        error: str,
        trace: ExecutionTrace,
        route: RouteResult,
        provider_type: str = "unknown",
        plan: ExecutionPlan | None = None,
        exec_result: ExecutionResult | None = None,
    ) -> OrchestratorResult:
        trace.emit(EventType.TASK_FAILED, metadata={"error": error})
        self._audit.record(
            task=task,
            selected_model=model_name,
            execution_status="error",
            metadata={"error": error, "provider": provider_type, "local_inference": True},
        )
        return OrchestratorResult(
            run_id=trace.run_id,
            task=task,
            task_type=route.task_type,
            selected_model=model_name,
            provider=provider_type,
            execution_status="error",
            plan=self._plan_to_dicts(plan) if plan else [],
            tool_calls=self._outcomes_to_dicts(
                exec_result.outcomes if exec_result else []
            ),
            result=error,
            trace=trace.to_dicts(),
        )
