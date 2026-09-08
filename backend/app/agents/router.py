"""
Deterministic task router.

Analyzes a task string using keyword matching to determine the
task type. Does NOT use an LLM or any external service.

Supported task types:
    ``general``       — default for unrecognized tasks
    ``calculation``   — arithmetic / math tasks
    ``file_analysis`` — read or analyze a file
    ``multi_step``    — tasks requiring multiple tools
"""

import re
from pydantic import BaseModel


class RouteResult(BaseModel):
    """Structured output from the task router.

    Attributes:
        task_type:   One of general / calculation / file_analysis / multi_step.
        confidence:  How confident the router is (1.0 = keyword match).
        tools_hint:  Suggested tools based on the detected type.
    """

    task_type: str
    confidence: float = 1.0
    tools_hint: list[str] = []


# Keyword patterns (compiled once).
_CALC_PATTERN = re.compile(
    r"\b(calculate|compute|add|subtract|multiply|divide|sum|average|mean|"
    r"total|percentage|percent|math|arithmetic|what is \d+|how much is)\b",
    re.IGNORECASE,
)

_FILE_PATTERN = re.compile(
    r"\b(read|open|load|file|document|pdf|docx|txt|extract|content of|"
    r"contents of|text from|data from)\b",
    re.IGNORECASE,
)

# Connectors that signal multi-step.
_MULTI_STEP_PATTERN = re.compile(
    r"\b(and then|then|after that|also|and calculate|and compute|"
    r"and read|and summarize|and extract|and find)\b",
    re.IGNORECASE,
)


class TaskRouter:
    """Deterministic keyword-based task router.

    Does not call any external service. Returns a ``RouteResult``
    with the detected task type and suggested tools.
    """

    def route(self, task: str) -> RouteResult:
        """Classify a task string into a task type.

        Args:
            task: Natural-language task description.

        Returns:
            RouteResult with task_type, confidence, and tools_hint.
        """
        if not task or not task.strip():
            return RouteResult(task_type="general", confidence=0.5)

        has_calc = bool(_CALC_PATTERN.search(task))
        has_file = bool(_FILE_PATTERN.search(task))
        has_connector = bool(_MULTI_STEP_PATTERN.search(task))

        # Multi-step: both calculation and file indicators, or an
        # explicit connector phrase with at least one indicator.
        if has_calc and has_file:
            return RouteResult(
                task_type="multi_step",
                confidence=1.0,
                tools_hint=["file_reader", "calculator"],
            )

        if has_connector and (has_calc or has_file):
            tools: list[str] = []
            if has_file:
                tools.append("file_reader")
            if has_calc:
                tools.append("calculator")
            return RouteResult(
                task_type="multi_step",
                confidence=0.9,
                tools_hint=tools,
            )

        if has_calc:
            return RouteResult(
                task_type="calculation",
                confidence=1.0,
                tools_hint=["calculator"],
            )

        if has_file:
            return RouteResult(
                task_type="file_analysis",
                confidence=1.0,
                tools_hint=["file_reader"],
            )

        return RouteResult(
            task_type="general",
            confidence=0.5,
            tools_hint=[],
        )
