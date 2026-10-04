"""
Code Execution API — hardened Docker sandbox execution.

Two execution modes:
1. REST POST /execution/run      — waits for completion, returns stdout/stderr JSON.
2. WS   /execution/stream        — streams Docker output line-by-line to xterm.js.

Security enforcement:
  - Docker container restrictions:
      --rm  --network none  --memory 128m  --cpus 0.5  --pids-limit 64
      --read-only  --cap-drop ALL  --security-opt no-new-privileges
  - Host fallback is DISABLED by default (SAW_ALLOW_UNSANDBOXED_EXECUTION=false).
    When Docker is unavailable and unsandboxed execution is not explicitly
    allowed, the API returns a clear error instead of silently running on host.
  - Maximum timeout enforced server-side (SAW_SANDBOX_TIMEOUT_MAX=30).
  - Temp files cleaned up after execution.
"""

import asyncio
import json
import logging
import os
import subprocess
import sys
import tempfile

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/execution", tags=["execution"])

# ── Request / Response models ────────────────────────────────────────────────


class ExecuteRequest(BaseModel):
    code: str = Field(..., description="Python source code to execute.")
    language: str = Field(
        default="python",
        description="Language (only 'python' supported).",
    )
    timeout: int = Field(
        default=15, ge=1, le=60,
        description="Max execution time in seconds.",
    )


class ExecuteResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
    engine: str  # "docker" | "local_fallback" | "unavailable"
    sandboxed: bool
    security_profile: str  # "full" | "development" | "none"


# ── Helpers ──────────────────────────────────────────────────────────────────


def _is_docker_available() -> bool:
    """Check if the Docker daemon is reachable."""
    try:
        result = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            timeout=5,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _build_docker_cmd(code: str, settings) -> list[str]:
    """Build the fully hardened Docker run command for inline code."""
    return [
        "docker", "run",
        "--rm",
        "-i",
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


def _build_docker_cmd_file(tmp_dir: str, script_name: str, settings) -> list[str]:
    """Build the fully hardened Docker run command for file-based execution (WS streaming)."""
    return [
        "docker", "run",
        "--rm",
        "-v", f"{tmp_dir}:/sandbox:ro",
        "-w", "/sandbox",
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
        "python", "-u", script_name,
    ]


def _run_in_docker(code: str, timeout: int) -> ExecuteResponse:
    """Execute code inside an ephemeral, fully hardened Docker container."""
    settings = get_settings()
    cmd = _build_docker_cmd(code, settings)

    logger.info(
        "Executing code in hardened Docker sandbox "
        "(timeout=%ds, mem=%s, cpus=%s, pids=%d)",
        timeout, settings.sandbox_memory_limit,
        settings.sandbox_cpu_limit, settings.sandbox_pids_limit,
    )

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
        )
        return ExecuteResponse(
            stdout=result.stdout,
            stderr=result.stderr,
            exit_code=result.returncode,
            engine="docker",
            sandboxed=True,
            security_profile="full",
        )
    except subprocess.TimeoutExpired:
        return ExecuteResponse(
            stdout="",
            stderr=f"Execution timed out after {timeout} seconds.",
            exit_code=124,
            engine="docker",
            sandboxed=True,
            security_profile="full",
        )
    except Exception as exc:
        logger.exception("Docker execution failed: %s", exc)
        raise HTTPException(
            status_code=500, detail=f"Docker execution error: {exc}"
        ) from exc


def _run_locally(code: str, timeout: int) -> ExecuteResponse:
    """Development-only fallback: run code using the host Python interpreter.

    WARNING: This is NOT sandboxed. Only enabled when
    SAW_ALLOW_UNSANDBOXED_EXECUTION=true.
    """
    logger.warning(
        "⚠ UNSANDBOXED EXECUTION — running code with host Python. "
        "This is a development-only fallback and MUST NOT be used in production."
    )
    try:
        result = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True, text=True, timeout=timeout,
        )
        return ExecuteResponse(
            stdout=result.stdout,
            stderr=result.stderr,
            exit_code=result.returncode,
            engine="local_fallback",
            sandboxed=False,
            security_profile="development",
        )
    except subprocess.TimeoutExpired:
        return ExecuteResponse(
            stdout="",
            stderr=f"Execution timed out after {timeout} seconds.",
            exit_code=124,
            engine="local_fallback",
            sandboxed=False,
            security_profile="development",
        )
    except Exception as exc:
        logger.exception("Local execution failed: %s", exc)
        raise HTTPException(
            status_code=500, detail=f"Execution error: {exc}"
        ) from exc


# ── REST endpoint ────────────────────────────────────────────────────────────


@router.post("/run", response_model=ExecuteResponse)
async def execute_code(request: ExecuteRequest, req: Request) -> ExecuteResponse:
    """Execute Python code in a hardened Docker sandbox.

    When Docker is unavailable:
    - If SAW_ALLOW_UNSANDBOXED_EXECUTION=true → falls back to host Python (dev only).
    - If SAW_ALLOW_UNSANDBOXED_EXECUTION=false (default) → returns HTTP 503.
    """
    if request.language != "python":
        raise HTTPException(
            status_code=400, detail="Only 'python' language is supported."
        )

    settings = get_settings()

    # Enforce server-side timeout ceiling
    effective_timeout = min(request.timeout, settings.sandbox_timeout_max)

    loop = asyncio.get_running_loop()
    docker_ok = _is_docker_available()

    if docker_ok:
        response = await loop.run_in_executor(
            None, _run_in_docker, request.code, effective_timeout,
        )
    elif settings.allow_unsandboxed_execution:
        # Development-only host fallback — explicitly opted in
        logger.warning(
            "Docker unavailable; SAW_ALLOW_UNSANDBOXED_EXECUTION=true "
            "— using unsandboxed host execution."
        )
        response = await loop.run_in_executor(
            None, _run_locally, request.code, effective_timeout,
        )
    else:
        # FAIL CLOSED — refuse to execute without sandbox
        raise HTTPException(
            status_code=503,
            detail=(
                "Secure execution unavailable. Docker is not running and "
                "unsandboxed host execution is disabled "
                "(SAW_ALLOW_UNSANDBOXED_EXECUTION=false). "
                "Start Docker or enable the development fallback to proceed."
            ),
        )

    # Audit log the execution
    audit = getattr(req.app.state, "audit_service", None)
    if audit:
        audit.record(
            task="code_execution",
            selected_model="sandbox",
            execution_status="completed" if response.exit_code == 0 else "failed",
            metadata={
                "engine": response.engine,
                "sandboxed": response.sandboxed,
                "exit_code": response.exit_code,
                "timeout": effective_timeout,
                "language": request.language,
            },
        )

    logger.info(
        "Execution complete — engine=%s sandboxed=%s exit_code=%d",
        response.engine, response.sandboxed, response.exit_code,
    )
    return response


@router.get("/health")
async def execution_health() -> dict:
    """Check if the Docker execution sandbox is available and report security profile."""
    settings = get_settings()
    docker_ok = _is_docker_available()

    if docker_ok:
        engine = "docker"
        security = "full"
        status = "ready"
    elif settings.allow_unsandboxed_execution:
        engine = "local_fallback"
        security = "development"
        status = "degraded"
    else:
        engine = "unavailable"
        security = "none"
        status = "unavailable"

    return {
        "docker_available": docker_ok,
        "engine": engine,
        "status": status,
        "sandboxed": docker_ok,
        "security_profile": security,
        "allow_unsandboxed": settings.allow_unsandboxed_execution,
        "restrictions": {
            "network": "none",
            "memory": settings.sandbox_memory_limit,
            "cpus": settings.sandbox_cpu_limit,
            "pids_limit": settings.sandbox_pids_limit,
            "read_only": True,
            "cap_drop": "ALL",
            "no_new_privileges": True,
            "max_timeout": settings.sandbox_timeout_max,
        } if docker_ok else None,
    }


# ── WebSocket streaming endpoint ─────────────────────────────────────────────


@router.websocket("/stream")
async def websocket_execute(websocket: WebSocket) -> None:
    """Stream Docker execution output line-by-line to xterm.js.

    Protocol:
      1. Client connects and sends: {"code": "...", "timeout": 15}
      2. Server writes code to a temp file, boots Docker container
         with -u (unbuffered) flag, streams each line back.
      3. On completion, sends final status and closes.

    Security:
      When Docker is unavailable, the WebSocket will only use host
      execution if SAW_ALLOW_UNSANDBOXED_EXECUTION=true. Otherwise
      it sends an error and closes.
    """
    await websocket.accept()
    settings = get_settings()
    docker_available = _is_docker_available()

    async def send(text: str) -> None:
        """Send xterm-compatible text (requires \\r\\n line endings)."""
        await websocket.send_text(text.replace("\n", "\r\n"))

    try:
        # Receive payload
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=30)
        payload = json.loads(raw)
        code: str = payload.get("code", "")
        timeout: int = min(
            int(payload.get("timeout", 15)),
            settings.sandbox_timeout_max,
        )

        if not code.strip():
            await send("\x1b[31m[Error] No code received.\x1b[0m\r\n")
            await websocket.close()
            return

        # Check execution availability
        if not docker_available and not settings.allow_unsandboxed_execution:
            await send(
                "\x1b[31m[Security] Secure execution unavailable. "
                "Docker is not running and unsandboxed execution is disabled.\x1b[0m\r\n"
            )
            await websocket.close()
            return

        # Write code to temp file
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", prefix="sandbox_",
            delete=False, encoding="utf-8",
        ) as tmp:
            tmp.write(code)
            tmp_path = tmp.name

        tmp_dir = os.path.dirname(tmp_path)
        script_name = os.path.basename(tmp_path)

        process = None
        try:
            if docker_available:
                await send(
                    "\x1b[36m[Docker] Booting hardened container: "
                    f"{settings.sandbox_docker_image} "
                    f"(net=none, mem={settings.sandbox_memory_limit}, "
                    f"pids={settings.sandbox_pids_limit}, "
                    f"read-only, cap-drop ALL, no-new-privileges)"
                    "\x1b[0m\r\n"
                )
                cmd = _build_docker_cmd_file(tmp_dir, script_name, settings)
                engine = "docker"
            else:
                await send(
                    "\x1b[33m[Warning] Docker unavailable — using "
                    "host Python (NOT sandboxed, dev-only mode).\x1b[0m\r\n"
                )
                cmd = [sys.executable, "-u", tmp_path]
                engine = "local_fallback"

            loop = asyncio.get_running_loop()
            process = await loop.run_in_executor(
                None,
                lambda: subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                ),
            )

            # Stream output line-by-line
            async def _stream() -> None:
                assert process.stdout is not None
                for line in iter(process.stdout.readline, ""):
                    await send(line)
                process.stdout.close()
                process.wait()

            await asyncio.wait_for(_stream(), timeout=timeout)

            exit_code = process.returncode
            color = "\x1b[32m" if exit_code == 0 else "\x1b[31m"
            await send(
                f"\r\n{color}[{engine}] Process exited with code "
                f"{exit_code}. Container destroyed.\x1b[0m\r\n"
            )

        except asyncio.TimeoutError:
            await send(
                f"\r\n\x1b[31m[Timeout] Execution exceeded {timeout}s "
                f"limit. Container destroyed.\x1b[0m\r\n"
            )
            if process:
                try:
                    process.kill()
                except Exception:
                    pass
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected during execution.")
    except Exception as exc:
        logger.exception("WebSocket execution error: %s", exc)
        try:
            await send(f"\r\n\x1b[31m[System Error] {exc}\x1b[0m\r\n")
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
