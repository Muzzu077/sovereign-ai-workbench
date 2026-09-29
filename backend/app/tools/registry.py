"""
Tool registry.

Central catalog of all available tools. The AgentExecutor
resolves tools exclusively through this registry — it never
instantiates tools directly.
"""

from app.tools.base import Tool


class ToolRegistry:
    """Registry for agent tools.

    Provides register / get / has / list operations. Only tools
    registered here are available for agent execution.
    """

    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        """Register a tool instance.

        Args:
            tool: A concrete ``Tool`` implementation.

        Raises:
            ValueError: If a tool with the same name is already registered.
        """
        if tool.name in self._tools:
            raise ValueError(
                f"Tool '{tool.name}' is already registered. "
                f"Unregister it first or use a different name."
            )
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool:
        """Retrieve a tool by name.

        Raises:
            KeyError: If no tool is registered under that name.
        """
        if name not in self._tools:
            raise KeyError(
                f"No tool registered under '{name}'. "
                f"Available: {list(self._tools.keys())}"
            )
        return self._tools[name]

    def has(self, name: str) -> bool:
        """Check whether a tool is registered."""
        return name in self._tools

    def list_tools(self) -> list[str]:
        """Return names of all registered tools."""
        return list(self._tools.keys())

    def get_all(self) -> dict[str, Tool]:
        """Return all registered tools as a dict."""
        return dict(self._tools)
