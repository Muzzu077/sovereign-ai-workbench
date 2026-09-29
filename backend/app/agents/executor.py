"""
Agent executor.

Accepts an ``ExecutionPlan`` and executes its steps sequentially,
resolving tools exclusively through the ``ToolRegistry``.

The executor:
- Validates tool input before calling ``execute()``.
- Captures each ``ToolResult``.
- Runs verification via the ``VerifierRegistry``.
- Stops on unrecoverable failure.
- Emits trace events for every stage.
- Returns a structured ``ExecutionResult``.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.agents.planner import ExecutionPlan, PlanStep
from app.agents.trace import ExecutionTrace, EventType
from app.agents.verifier import VerifierRegistry, VerificationResult, VerificationStatus
from app.tools.base import ToolResult
from app.tools.registry import ToolRegistry


class StepOutcome(BaseModel):
    """Result of executing a single plan step."""

    step_id: str
    tool: str
    tool_result: ToolResult
    verification: VerificationResult | None = None


class ExecutionResult(BaseModel):
    """Aggregate result of executing an entire plan."""

    run_id: str
    success: bool
    outcomes: list[StepOutcome] = []
    error: str | None = None


class AgentExecutor:
    """Executes an ``ExecutionPlan`` step by step.

    The executor knows nothing about individual tool implementations.
    It resolves tools through the registry and invokes them with the
    input specified in each ``PlanStep``.

    Args:
        tool_registry:     Registry of available tools.
        verifier_registry: Registry of available verifiers.
    """

    def __init__(
        self,
        tool_registry: ToolRegistry,
        verifier_registry: VerifierRegistry,
    ) -> None:
        self._tools = tool_registry
        self._verifiers = verifier_registry

    def execute(
        self,
        plan: ExecutionPlan,
        trace: ExecutionTrace,
    ) -> ExecutionResult:
        """Execute all steps in the plan sequentially.

        Args:
            plan:  The execution plan to run.
            trace: The execution trace to emit events into.

        Returns:
            ExecutionResult with per-step outcomes.
        """
        outcomes: list[StepOutcome] = []
        # Accumulated context from previous steps for downstream use.
        context: dict[str, Any] = {}

        for step in plan.steps:
            outcome = self._execute_step(step, trace, context)
            outcomes.append(outcome)

            if not outcome.tool_result.success:
                # Stop on unrecoverable failure.
                trace.emit(
                    EventType.TASK_FAILED,
                    step_id=step.step_id,
                    metadata={"error": outcome.tool_result.error or "unknown"},
                )
                return ExecutionResult(
                    run_id=plan.run_id,
                    success=False,
                    outcomes=outcomes,
                    error=f"Step '{step.step_id}' ({step.tool}) failed: {outcome.tool_result.error}",
                )

            # Store result in context for downstream steps.
            context[step.step_id] = outcome.tool_result
            context[f"last_{step.tool}_result"] = outcome.tool_result

        return ExecutionResult(
            run_id=plan.run_id,
            success=True,
            outcomes=outcomes,
        )

    # ---------------------------------------------------------- internals

    def _execute_step(
        self,
        step: PlanStep,
        trace: ExecutionTrace,
        context: dict[str, Any],
    ) -> StepOutcome:
        """Execute a single plan step."""
        # --- Resolve tool ---
        if not self._tools.has(step.tool):
            return StepOutcome(
                step_id=step.step_id,
                tool=step.tool,
                tool_result=ToolResult(
                    success=False,
                    error=f"Tool '{step.tool}' is not registered.",
                ),
            )

        tool = self._tools.get(step.tool)
        tool_input = self._prepare_input(step, context)

        # --- Execute ---
        trace.emit(
            EventType.TOOL_STARTED,
            step_id=step.step_id,
            metadata={"tool": step.tool, "description": step.description},
        )

        try:
            tool_result = tool.execute(tool_input)
        except Exception as exc:
            tool_result = ToolResult(
                success=False,
                error=f"Tool execution error: {exc}",
            )

        if tool_result.success:
            # Build safe metadata (truncate large content).
            safe_meta: dict[str, Any] = {"tool": step.tool}
            if tool_result.result is not None:
                preview = str(tool_result.result)
                safe_meta["result_preview"] = preview[:200] if len(preview) > 200 else preview
            trace.emit(EventType.TOOL_COMPLETED, step_id=step.step_id, metadata=safe_meta)
        else:
            trace.emit(
                EventType.TOOL_FAILED,
                step_id=step.step_id,
                metadata={"tool": step.tool, "error": tool_result.error or "unknown"},
            )

        # --- Verify ---
        trace.emit(EventType.VERIFICATION_STARTED, step_id=step.step_id, metadata={"tool": step.tool})
        verification = self._verifiers.verify(step.tool, tool_input, tool_result)
        trace.emit(
            EventType.VERIFICATION_COMPLETED,
            step_id=step.step_id,
            metadata={
                "tool": step.tool,
                "status": verification.status.value,
                "detail": verification.detail,
            },
        )

        return StepOutcome(
            step_id=step.step_id,
            tool=step.tool,
            tool_result=tool_result,
            verification=verification,
        )

    def _prepare_input(
        self,
        step: PlanStep,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """Prepare tool input, enriching from context if needed.

        For multi-step plans, a calculator step that depends on a
        file_reader step may need the file content to build its
        expression. This method handles that wiring.
        """
        tool_input = dict(step.input)

        # If this is a calculator step with an empty/generic expression
        # and there's file_reader context, try to build an expression
        # from the file content (e.g. compute average of numbers).
        if step.tool == "calculator" and step.depends_on:
            file_result = context.get("last_file_reader_result")
            if file_result and file_result.success and file_result.result:
                expr = tool_input.get("expression", "")
                if not expr or not any(c.isdigit() for c in expr):
                    # Try to extract numbers and compute the requested operation.
                    numbers = self._extract_numbers(file_result.result)
                    if numbers:
                        # Default to average if the task mentions it; otherwise sum.
                        tool_input["expression"] = self._build_aggregation_expression(
                            numbers, step.description
                        )

        return tool_input

    @staticmethod
    def _extract_numbers(text: str) -> list[float]:
        """Extract numeric values from text content."""
        import re
        # Match integers and decimals, but not things like version numbers.
        matches = re.findall(r'(?<!\.)(?<!\w)(-?\d+(?:\.\d+)?)(?!\w)(?!\.)', text)
        numbers: list[float] = []
        for m in matches:
            try:
                val = float(m)
                numbers.append(val)
            except ValueError:
                continue
        return numbers

    @staticmethod
    def _build_aggregation_expression(numbers: list[float], description: str) -> str:
        """Build an arithmetic expression for aggregating numbers."""
        desc_lower = description.lower()
        num_strs = [str(int(n)) if n == int(n) else str(n) for n in numbers]

        if "average" in desc_lower or "mean" in desc_lower:
            return f"({' + '.join(num_strs)}) / {len(numbers)}"
        elif "sum" in desc_lower or "total" in desc_lower:
            return " + ".join(num_strs)
        else:
            # Default to average for "calculate" with no specific operation.
            return f"({' + '.join(num_strs)}) / {len(numbers)}"
