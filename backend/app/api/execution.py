"""
Code Execution API — sandboxed Docker execution endpoint.

Two execution modes:
1. REST POST /execution/run      — waits for completion, returns stdout/stderr JSON.
2. WS   /execution/stream        — streams Docker output line-by-line to xterm.js.

Security:
  - Docker container: --rm, --network none, --memory 128m, --cpus 0.5
  - Host fallback when Docker is unavailable (dev environments)
  - Temp files cleaned up after execution
"""

import asyncio
import json
import logging
import os
import subprocess
import sys
import tempfile

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

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
    engine: str  # "docker" | "local_fallback"


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


def _run_in_docker(code: str, timeout: int) -> ExecuteResponse:
    """Execute code inside an ephemeral, network-isolated Alpine Python container."""
    cmd = [
        "docker", "run",
        "--rm",
        "-i",
        "--network", "none",
        "--memory", "128m",
        "--cpus", "0.5",
        "python:3.11-alpine",
        "python", "-c", code,
    ]

    logger.info("Executing code in Docker sandbox (timeout=%ds)", timeout)

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
        )
        return ExecuteResponse(
            stdout=result.stdout,
            stderr=result.stderr,
            exit_code=result.returncode,
            engine="docker",
        )
    except subprocess.TimeoutExpired:
        return ExecuteResponse(
            stdout="",
            stderr=f"Execution timed out after {timeout} seconds.",
            exit_code=124,
            engine="docker",
        )
    except Exception as exc:
        logger.exception("Docker execution failed: %s", exc)
        raise HTTPException(
            status_code=500, detail=f"Docker execution error: {exc}"
        ) from exc


def _run_locally(code: str, timeout: int) -> ExecuteResponse:
    """Fallback: run code using the host Python interpreter."""
    logger.warning(
        "Docker unavailable — running code with host Python (NOT sandboxed)."
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
        )
    except subprocess.TimeoutExpired:
        return ExecuteResponse(
            stdout="",
            stderr=f"Execution timed out after {timeout} seconds.",
            exit_code=124,
            engine="local_fallback",
        )
    except Exception as exc:
        logger.exception("Local execution failed: %s", exc)
        raise HTTPException(
            status_code=500, detail=f"Execution error: {exc}"
        ) from exc


# ── REST endpoint ────────────────────────────────────────────────────────────


@router.post("/run", response_model=ExecuteResponse)
async def execute_code(request: ExecuteRequest) -> ExecuteResponse:
    """Execute Python code in a sandboxed Docker container.

    Falls back to the host interpreter if Docker is unavailable.
    """
    if request.language != "python":
        raise HTTPException(
            status_code=400, detail="Only 'python' language is supported."
        )

    loop = asyncio.get_running_loop()
    if _is_docker_available():
        response = await loop.run_in_executor(
            None, _run_in_docker, request.code, request.timeout,
        )
    else:
        response = await loop.run_in_executor(
            None, _run_locally, request.code, request.timeout,
        )

    logger.info(
        "Execution complete — engine=%s exit_code=%d",
        response.engine, response.exit_code,
    )
    return response


@router.get("/health")
async def execution_health() -> dict:
    """Check if the Docker execution sandbox is available."""
    docker_ok = _is_docker_available()
    return {
        "docker_available": docker_ok,
        "engine": "docker" if docker_ok else "local_fallback",
        "status": "ready",
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
    """
    await websocket.accept()
    docker_available = _is_docker_available()
    engine = "docker" if docker_available else "local_fallback"

    async def send(text: str) -> None:
        """Send xterm-compatible text (requires \\r\\n line endings)."""
        await websocket.send_text(text.replace("\n", "\r\n"))

    try:
        # Receive payload
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=30)
        payload = json.loads(raw)
        code: str = payload.get("code", "")
        timeout: int = min(int(payload.get("timeout", 15)), 60)

        if not code.strip():
            await send("\x1b[31m[Error] No code received.\x1b[0m\r\n")
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
                    "\x1b[36m[Docker] Booting python:3.11-alpine "
                    "container...\x1b[0m\r\n"
                )
                cmd = [
                    "docker", "run", "--rm",
                    "-v", f"{tmp_dir}:/sandbox:ro",
                    "-w", "/sandbox",
                    "--network", "none",
                    "--memory", "128m",
                    "--cpus", "0.5",
                    "python:3.11-alpine",
                    "python", "-u", script_name,
                ]
            else:
                await send(
                    "\x1b[33m[Warning] Docker unavailable — using "
                    "host Python (not sandboxed).\x1b[0m\r\n"
                )
                cmd = [sys.executable, "-u", tmp_path]

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
