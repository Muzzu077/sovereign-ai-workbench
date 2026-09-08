"""
Tool abstraction layer.

Defines the base interface that every tool must implement.
Tools are the controlled mechanism through which the agent
interacts with external resources (calculator, files, etc.).

The model does NOT directly execute tools. The application's
AgentExecutor resolves tools through the ToolRegistry and
invokes them with validated, structured input.
"""

from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel


class ToolInput(BaseModel):
    """Base class for structured tool input."""

    pass


class ToolResult(BaseModel):
    """Structured result returned by every tool execution.

    Attributes:
        success:  Whether the tool completed without error.
        result:   The primary output value (type depends on the tool).
        error:    Human-readable error message when ``success`` is False.
        metadata: Optional extra context about the execution.
    """

    success: bool
    result: Any = None
    error: str | None = None
    metadata: dict[str, Any] = {}


class Tool(ABC):
    """Abstract base class for all agent tools.

    Every tool must expose:
    - ``name``         — unique identifier
    - ``description``  — human-readable purpose
    - ``input_schema`` — JSON Schema dict describing expected input
    - ``execute()``    — run the tool with validated input

    Tools are decoupled from any specific LLM. They receive
    structured input and return a ``ToolResult``.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique tool identifier (e.g. ``calculator``, ``file_reader``)."""
        ...

    @property
    @abstractmethod
    def description(self) -> str:
        """Human-readable description of what the tool does."""
        ...

    @property
    @abstractmethod
    def input_schema(self) -> dict[str, Any]:
        """JSON Schema dict describing the tool's expected input."""
        ...

    @abstractmethod
    def execute(self, tool_input: dict[str, Any]) -> ToolResult:
        """Execute the tool with the given input.

        Args:
            tool_input: Dictionary matching ``input_schema``.

        Returns:
            A ``ToolResult`` with success/failure and output.
        """
        ...
