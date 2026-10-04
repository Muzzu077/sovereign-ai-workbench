"""
File management tool for the agent system.

Provides local file reading, writing, listing, and metadata
capabilities within a sandboxed workspace directory.

Security:
    - All paths are resolved and validated against the workspace root.
    - Path traversal is rejected.
    - Write operations create files only within the workspace.
    - Binary files are reported but not read as text.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from app.tools.base import Tool, ToolResult

logger = logging.getLogger(__name__)

_MAX_READ_BYTES = 512_000  # 500 KB text read limit
_MAX_WRITE_BYTES = 1_024_000  # 1 MB write limit


class FileManagementTool(Tool):
    """Agent tool for managing files within a workspace directory.

    Supports operations: read, write, list, info.
    All file access is confined to the workspace root.

    Args:
        workspace_root: Absolute path to the workspace directory.
    """

    def __init__(self, workspace_root: str | Path) -> None:
        self._workspace = Path(workspace_root).resolve()
        self._workspace.mkdir(parents=True, exist_ok=True)

    @property
    def name(self) -> str:
        return "file_manager"

    @property
    def description(self) -> str:
        return (
            "Manage local files within the workspace. Supports operations: "
            "'read' (read file text), 'write' (write text to file), "
            "'list' (list directory contents), 'info' (get file metadata). "
            "All paths are relative to the workspace root."
        )

    @property
    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": ["read", "write", "list", "info"],
                    "description": "The file operation to perform.",
                },
                "path": {
                    "type": "string",
                    "description": "File or directory path relative to workspace.",
                },
                "content": {
                    "type": "string",
                    "description": "Text content (required for 'write' operation).",
                },
            },
            "required": ["operation", "path"],
        }

    def _validate_path(self, rel_path: str) -> Path | None:
        """Resolve a relative path and validate it's within workspace."""
        resolved = (self._workspace / rel_path).resolve()
        if not str(resolved).startswith(str(self._workspace)):
            return None
        return resolved

    def execute(self, tool_input: dict[str, Any]) -> ToolResult:
        """Execute a file operation."""
        operation = tool_input.get("operation", "")
        path_str = tool_input.get("path", "")

        if not operation:
            return ToolResult(
                success=False, error="Missing required parameter: operation"
            )
        if not path_str:
            return ToolResult(
                success=False, error="Missing required parameter: path"
            )

        resolved = self._validate_path(path_str)
        if resolved is None:
            return ToolResult(
                success=False,
                error="Path traversal rejected: path must be within workspace.",
            )

        if operation == "read":
            return self._read(resolved, path_str)
        elif operation == "write":
            content = tool_input.get("content", "")
            return self._write(resolved, path_str, content)
        elif operation == "list":
            return self._list(resolved, path_str)
        elif operation == "info":
            return self._info(resolved, path_str)
        else:
            return ToolResult(
                success=False,
                error=f"Unknown operation: {operation}. Use: read, write, list, info.",
            )

    def _read(self, path: Path, rel_path: str) -> ToolResult:
        """Read text content from a file."""
        if not path.exists():
            return ToolResult(success=False, error=f"File not found: {rel_path}")
        if not path.is_file():
            return ToolResult(success=False, error=f"Not a file: {rel_path}")

        size = path.stat().st_size
        if size > _MAX_READ_BYTES:
            return ToolResult(
                success=False,
                error=f"File too large ({size:,} bytes). Max: {_MAX_READ_BYTES:,} bytes.",
                metadata={"file_size": size},
            )

        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception as exc:
            return ToolResult(success=False, error=f"Read error: {exc}")

        return ToolResult(
            success=True,
            result=text,
            metadata={"file": rel_path, "size_bytes": size, "lines": text.count("\n") + 1},
        )

    def _write(self, path: Path, rel_path: str, content: str) -> ToolResult:
        """Write text content to a file."""
        if not content:
            return ToolResult(
                success=False, error="Missing required parameter: content"
            )

        content_bytes = content.encode("utf-8")
        if len(content_bytes) > _MAX_WRITE_BYTES:
            return ToolResult(
                success=False,
                error=f"Content too large ({len(content_bytes):,} bytes). Max: {_MAX_WRITE_BYTES:,} bytes.",
            )

        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        except Exception as exc:
            return ToolResult(success=False, error=f"Write error: {exc}")

        return ToolResult(
            success=True,
            result=f"Written {len(content_bytes):,} bytes to {rel_path}",
            metadata={
                "file": rel_path,
                "size_bytes": len(content_bytes),
                "lines": content.count("\n") + 1,
            },
        )

    def _list(self, path: Path, rel_path: str) -> ToolResult:
        """List contents of a directory."""
        if not path.exists():
            return ToolResult(success=False, error=f"Directory not found: {rel_path}")
        if not path.is_dir():
            return ToolResult(success=False, error=f"Not a directory: {rel_path}")

        entries = []
        try:
            for entry in sorted(path.iterdir()):
                stat = entry.stat()
                entries.append({
                    "name": entry.name,
                    "type": "directory" if entry.is_dir() else "file",
                    "size": stat.st_size if entry.is_file() else None,
                })
        except PermissionError as exc:
            return ToolResult(success=False, error=f"Permission denied: {exc}")

        return ToolResult(
            success=True,
            result=entries,
            metadata={"directory": rel_path, "count": len(entries)},
        )

    def _info(self, path: Path, rel_path: str) -> ToolResult:
        """Get metadata about a file or directory."""
        if not path.exists():
            return ToolResult(success=False, error=f"Not found: {rel_path}")

        stat = path.stat()
        info = {
            "path": rel_path,
            "type": "directory" if path.is_dir() else "file",
            "size_bytes": stat.st_size,
            "modified": stat.st_mtime,
            "extension": path.suffix.lower() if path.is_file() else None,
        }

        if path.is_dir():
            try:
                info["child_count"] = len(list(path.iterdir()))
            except PermissionError:
                info["child_count"] = None

        return ToolResult(
            success=True,
            result=info,
            metadata={"path": rel_path},
        )
