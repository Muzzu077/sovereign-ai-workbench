"""
Code Generation API — stream Python code from local LLM via SSE.

Uses llama.cpp's OpenAI-compatible /v1/chat/completions endpoint
with streaming enabled. The response is formatted as Server-Sent Events:

    event: summary   — one-line description of the code
    event: token     — each streamed token of code
    event: done      — signals completion
    event: error     — signals an error
"""

import json
import logging
from typing import AsyncIterator

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.security.network_monitor import is_loopback_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/codegen", tags=["codegen"])

SYSTEM_PROMPT = """You are an expert Python programmer embedded in a secure, air-gapped AI workbench for industrial use.
When asked to write code, follow these rules STRICTLY:
0. Don't start with ```python```, just give valid code it will be directly run on a docker sandbox
1. Reply with ONLY valid Python code — no markdown fences, no explanations outside the code.
2. Include concise docstrings and inline comments where helpful.
3. Before the code, output exactly ONE line starting with "# SUMMARY: " describing what the code does.
4. NEVER use input() or any other interactive function. The code runs non-interactively in a sandbox.
5. Always initialize ALL variables with concrete hard-coded values or sensible defaults directly in the code.
   - If the user asks for a script that processes data, include realistic sample data inline.
   - If a parameter is needed, define it as a variable at the top of the script with a clear value.
6. The code must be fully self-contained and runnable without any user interaction or external files.
Keep code clean, readable, and production-quality."""


class CodeGenRequest(BaseModel):
    prompt: str = Field(..., description="User's natural language coding request.")
    max_tokens: int = Field(default=1500, ge=100, le=4096)


class CodeGenHealthResponse(BaseModel):
    model: str
    status: str
    endpoint: str


@router.get("/health", response_model=CodeGenHealthResponse)
async def codegen_health(request: Request) -> CodeGenHealthResponse:
    """Check if the code generation model is reachable."""
    settings = request.app.state.settings
    base_url = settings.coder_base_url
    model_id = settings.coder_model_id

    # Air-gap guard: refuse if the coder URL is not loopback
    if not is_loopback_url(base_url):
        return CodeGenHealthResponse(
            model=model_id, status="air_gap_violation", endpoint=base_url,
        )

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{base_url}/health")
            resp.raise_for_status()
        return CodeGenHealthResponse(
            model=model_id, status="ok", endpoint=base_url,
        )
    except Exception as exc:
        logger.warning("Coder health check failed: %s", exc)
        return CodeGenHealthResponse(
            model=model_id, status="unreachable", endpoint=base_url,
        )


@router.post("/generate")
async def generate_code(
    body: CodeGenRequest, request: Request,
) -> StreamingResponse:
    """Stream Python code from the local LLM via SSE."""
    settings = request.app.state.settings
    base_url = settings.coder_base_url
    model_id = settings.coder_model_id

    # Air-gap guard: refuse to stream if the URL is not loopback
    if not is_loopback_url(base_url):
        async def _reject() -> AsyncIterator[str]:
            yield (
                f"event: error\n"
                f"data: {json.dumps({'error': 'Air-gap violation: coder_base_url is not a loopback address'})}\n\n"
            )
        return StreamingResponse(_reject(), media_type="text/event-stream")

    async def event_stream() -> AsyncIterator[str]:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": body.prompt},
        ]
        payload = {
            "model": model_id,
            "messages": messages,
            "max_tokens": body.max_tokens,
            "temperature": 0.2,
            "stream": True,
        }

        summary_sent = False
        buffer = ""

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream(
                    "POST",
                    f"{base_url}/v1/chat/completions",
                    json=payload,
                    headers={"Content-Type": "application/json"},
                ) as response:
                    response.raise_for_status()

                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                            token = (
                                chunk["choices"][0]
                                .get("delta", {})
                                .get("content", "")
                            )
                            if not token:
                                continue

                            buffer += token

                            # Extract SUMMARY line if present
                            if not summary_sent and "\n" in buffer:
                                first_line, rest = buffer.split("\n", 1)
                                if first_line.startswith("# SUMMARY:"):
                                    summary = first_line[10:].strip()
                                    yield (
                                        f"event: summary\n"
                                        f"data: {json.dumps(summary)}\n\n"
                                    )
                                    summary_sent = True
                                    buffer = rest
                                    for ch in rest:
                                        yield (
                                            f"event: token\n"
                                            f"data: {json.dumps(ch)}\n\n"
                                        )
                                    buffer = ""
                                    continue

                            if summary_sent:
                                yield (
                                    f"event: token\n"
                                    f"data: {json.dumps(token)}\n\n"
                                )

                        except (json.JSONDecodeError, KeyError):
                            continue

                    # If no summary was extracted, send buffer as tokens
                    if not summary_sent:
                        yield (
                            f"event: summary\n"
                            f"data: {json.dumps('Code generated by local LLM.')}\n\n"
                        )
                        for ch in buffer:
                            yield (
                                f"event: token\n"
                                f"data: {json.dumps(ch)}\n\n"
                            )

                    yield "event: done\ndata: {}\n\n"

        except httpx.ConnectError:
            yield (
                f"event: error\n"
                f"data: {json.dumps('Cannot reach code generation model. Is llama-server running?')}\n\n"
            )
        except Exception as exc:
            logger.exception("Code generation error: %s", exc)
            yield (
                f"event: error\n"
                f"data: {json.dumps(str(exc))}\n\n"
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
