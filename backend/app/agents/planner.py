"""
Task planner.

Converts a task and its route metadata into a structured
``ExecutionPlan`` consisting of ordered ``PlanStep`` entries.

Each step references a tool by name. The planner validates that
every referenced tool exists in the ``ToolRegistry`` before
returning the plan.

The planner uses deterministic rules — no LLM is involved yet.
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from pydantic import BaseModel, Field

from app.agents.router import RouteResult
from app.tools.registry import ToolRegistry


class PlanStep(BaseModel):
    """A single step in an execution plan.

    Attributes:
        step_id:     Unique identifier for this step.
        tool:        Name of the tool to invoke (must be in ToolRegistry).
        description: Human-readable description of what this step does.
        input:       Pre-populated input dict for the tool (may be partial;
                     the executor can fill in values from prior steps).
        depends_on:  List of step_ids this step depends on.
    """

    step_id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    tool: str
    description: str
    input: dict[str, Any] = {}
    depends_on: list[str] = []


class ExecutionPlan(BaseModel):
    """Ordered list of steps the executor should perform.

    Attributes:
        run_id: Unique identifier for this execution run.
        task:   The original user task.
        steps:  Ordered list of ``PlanStep`` entries.
    """

    run_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    task: str
    steps: list[PlanStep] = []


class PlanValidationError(Exception):
    """Raised when a plan references a tool not in the registry."""


class TaskPlanner:
    """Deterministic task planner.

    Given a task string and a ``RouteResult``, produces an
    ``ExecutionPlan`` where each step maps to a registered tool.

    Args:
        tool_registry: The ``ToolRegistry`` used to validate tool names.
    """

    def __init__(self, tool_registry: ToolRegistry) -> None:
        self._tools = tool_registry

    def plan(self, task: str, route: RouteResult) -> ExecutionPlan:
        """Create an execution plan for the given task and route.

        Raises:
            PlanValidationError: If any step references an unknown tool.
        """
        steps = self._build_steps(task, route)
        plan = ExecutionPlan(task=task, steps=steps)
        self._validate(plan)
        return plan

    # ------------------------------------------------------------ internals

    def _build_steps(self, task: str, route: RouteResult) -> list[PlanStep]:
        """Build plan steps based on the route result."""
        if route.task_type == "calculation":
            # Extract the expression from the task.
            expr = self._extract_expression(task)
            return [
                PlanStep(
                    tool="calculator",
                    description="Evaluate the arithmetic expression.",
                    input={"expression": expr},
                ),
            ]

        if route.task_type == "file_analysis":
            file_path = self._extract_file_path(task)
            return [
                PlanStep(
                    tool="file_reader",
                    description="Read and extract text from the file.",
                    input={"file_path": file_path},
                ),
            ]

        if route.task_type == "multi_step":
            return self._build_multi_step(task, route)

        # general — no tools, just LLM generation.
        return []

    def _build_multi_step(self, task: str, route: RouteResult) -> list[PlanStep]:
        """Build a multi-step plan using tools_hint ordering."""
        steps: list[PlanStep] = []

        if "file_reader" in route.tools_hint:
            file_path = self._extract_file_path(task)
            step = PlanStep(
                tool="file_reader",
                description="Read and extract text from the file.",
                input={"file_path": file_path},
            )
            steps.append(step)

        if "calculator" in route.tools_hint:
            expr = self._extract_expression(task)
            calc_step = PlanStep(
                tool="calculator",
                description="Perform the calculation.",
                input={"expression": expr},
                depends_on=[s.step_id for s in steps],
            )
            steps.append(calc_step)

        return steps

    def _validate(self, plan: ExecutionPlan) -> None:
        """Validate all tool references exist in the registry."""
        for step in plan.steps:
            if not self._tools.has(step.tool):
                raise PlanValidationError(
                    f"Plan step '{step.step_id}' references tool '{step.tool}' "
                    f"which is not registered. "
                    f"Available tools: {self._tools.list_tools()}"
                )

    # ------------------------------------------------------- text extraction

    @staticmethod
    def _extract_expression(task: str) -> str:
        """Best-effort extraction of an arithmetic expression from the task.

        Looks for patterns like ``calculate 2+2`` or ``what is 125 * 37``.
        Falls back to the full task if no pattern matches.
        """
        # Pattern: "calculate <expr>" or "compute <expr>"
        m = re.search(
            r"(?:calculate|compute|what is|how much is)\s+(.+?)(?:\.|$)",
            task,
            re.IGNORECASE,
        )
        if m:
            return m.group(1).strip().rstrip(".")

        # Pattern: standalone arithmetic expression.
        m = re.search(r"([\d\s\+\-\*\/\(\)\.\%]+)", task)
        if m:
            candidate = m.group(1).strip()
            if any(c.isdigit() for c in candidate):
                return candidate

        return task

    @staticmethod
    def _extract_file_path(task: str) -> str:
        """Best-effort extraction of a file path from the task.

        Looks for common file path patterns (e.g. ``data.txt``,
        ``reports/q1.pdf``).
        """
        # Match quoted paths first.
        m = re.search(r"""['"]([^'"]+\.\w+)['"]""", task)
        if m:
            return m.group(1)

        # Match unquoted paths with extensions.
        m = re.search(r'([\w/.\\-]+\.\w{2,5})\b', task)
        if m:
            return m.group(1)

        return ""
