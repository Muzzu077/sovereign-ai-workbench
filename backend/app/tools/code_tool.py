"""
Code execution tool for the agent system.

Provides sandboxed code execution through the hardened Docker sandbox
(or development-mode host fallback). This tool wraps the execution
subsystem to make it available as an agent tool.

Security:
    - Uses the same hardened Docker sandbox as the /execution/run API:
      --network none, --read-only, --cap-drop ALL, --no-new-privileges,
      --pids-limit, --memory limit.
    - Host fallback only when SAW_ALLOW_UNSANDBOXED_EXECUTION=true.
    - Enforces server-side timeout ceiling.
"""

from __future__ import annotations

import logging
import subprocess
import sys
from typing import Any

from app.config import get_settings
from app.tools.base import Tool, ToolResult

logger = logging.getLogger(__name__)


def _is_docker_available() -> bool:
    """Check if the Docker daemon is reachable."""
    try:
        result = subprocess.run(
            ["docker", "info"], capture_output=True, timeout=5,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


class CodeExecutionTool(Tool):
    """Agent tool for executing Python code in a sandboxed environment.

    Uses the hardened Docker container (or development-mode host fallback)
    to run Python code safely. Intended for the agent to execute
    calculations, data processing, or validation tasks.
    """

    @property
    def name(self) -> str:
        return "code_execution"

    @property
    def description(self) -> str:
        return (
            "Execute Python code in a secure sandbox. Input: code (Python source "
            "code string). Returns stdout, stderr, and exit code. The sandbox "
            "has no network access and limited resources. Only Python is supported."
        )

    @property
    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "Python source code to execute.",
                },
                "timeout": {
                    "type": "integer",
                    "description": "Max execution time in seconds (default 10, max 30).",
                    "default": 10,
                },
            },
            "required": ["code"],
        }

    def execute(self, tool_input: dict[str, Any]) -> ToolResult:
        """Execute Python code in the sandbox."""
        code = tool_input.get("code", "")
        timeout = min(int(tool_input.get("timeout", 10)), 30)

        if not code.strip():
            return ToolResult(
                success=False, error="Missing required parameter: code"
            )

        settings = get_settings()
        docker_ok = _is_docker_available()

        if docker_ok:
            return self._run_docker(code, timeout, settings)
        elif settings.allow_unsandboxed_execution:
            logger.warning(
                "CodeExecutionTool: Docker unavailable, using host fallback (dev only)."
            )
            return self._run_host(code, timeout)
        else:
            return ToolResult(
                success=False,
                error=(
                    "Secure execution unavailable. Docker is not running and "
                    "unsandboxed execution is disabled. Start Docker or set "
                    "SAW_ALLOW_UNSANDBOXED_EXECUTION=true for development."
                ),
                metadata={"engine": "unavailable", "sandboxed": False},
            )

    def _run_docker(self, code: str, timeout: int, settings) -> ToolResult:
        """Execute code in a hardened Docker container."""
        cmd = [
            "docker", "run",
            "--rm", "-i",
            "--network", "none",
            "--memory", settings.sandbox_memory_limit,
            "--cpus", settings.sandbox_cpu_limit,
            "--pids-limit", str(settings.sandbox_pids_limit),
            "--read-only",
            "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
            "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges",
            "--user", "nobody",
            settings.sandbox_docker_image,
            "python", "-c", code,
        ]

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=timeout,
            )
            return ToolResult(
                success=result.returncode == 0,
                result=result.stdout,
                error=result.stderr if result.returncode != 0 else None,
                metadata={
                    "engine": "docker",
                    "sandboxed": True,
                    "exit_code": result.returncode,
                    "security_profile": "full",
                },
            )
        except subprocess.TimeoutExpired:
            return ToolResult(
                success=False,
                error=f"Execution timed out after {timeout} seconds.",
                metadata={
                    "engine": "docker",
                    "sandboxed": True,
                    "exit_code": 124,
                    "security_profile": "full",
                },
            )
        except Exception as exc:
            return ToolResult(
                success=False,
                error=f"Docker execution error: {exc}",
                metadata={"engine": "docker"},
            )

    def _run_host(self, code: str, timeout: int) -> ToolResult:
        """Development-only: execute code with the host Python interpreter."""
        try:
            result = subprocess.run(
                [sys.executable, "-c", code],
                capture_output=True, text=True, timeout=timeout,
            )
            return ToolResult(
                success=result.returncode == 0,
                result=result.stdout,
                error=result.stderr if result.returncode != 0 else None,
                metadata={
                    "engine": "local_fallback",
                    "sandboxed": False,
                    "exit_code": result.returncode,
                    "security_profile": "development",
                },
            )
        except subprocess.TimeoutExpired:
            return ToolResult(
                success=False,
                error=f"Execution timed out after {timeout} seconds.",
                metadata={
                    "engine": "local_fallback",
                    "sandboxed": False,
                    "exit_code": 124,
                    "security_profile": "development",
                },
            )
        except Exception as exc:
            return ToolResult(
                success=False,
                error=f"Execution error: {exc}",
                metadata={"engine": "local_fallback"},
            )
