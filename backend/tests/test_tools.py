"""Tests for the agent tool registry built by app.main._build_tool_registry."""

from app.config import Settings
from app.main import _build_tool_registry


EXPECTED_TOOLS = [
    "calculator",
    "file_reader",
    "file_manager",
    "ocr",
    "document_generator",
    "code_execution",
]


class TestToolRegistry:
    """Validate the tool registry built at application startup."""

    def test_registry_has_exactly_six_tools(self, settings):
        registry = _build_tool_registry(settings)
        assert len(registry.list_tools()) == 6

    def test_each_expected_tool_is_present(self, settings):
        registry = _build_tool_registry(settings)
        registered = set(registry.list_tools())
        for name in EXPECTED_TOOLS:
            assert name in registered, f"Missing tool: {name}"

    def test_list_tools_returns_list_of_strings(self, settings):
        registry = _build_tool_registry(settings)
        tools = registry.list_tools()
        assert isinstance(tools, list)
        assert all(isinstance(t, str) for t in tools)
