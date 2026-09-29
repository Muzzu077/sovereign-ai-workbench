"""
Streaming Chat API — token-by-token LLM responses via SSE.

    POST /chat/stream — accepts messages array, streams response tokens
"""

import json
import logging
from typing import AsyncIterator, Optional

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class StreamChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(
        ..., description="Conversation history",
    )
    model_name: Optional[str] = Field(
        default=None, description="Model to use (defaults to general)",
    )
    system_prompt: Optional[str] = Field(
        default=None, description="System prompt override",
    )
    max_tokens: int = Field(default=2048, ge=1, le=8192)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)


@router.post("/stream")
async def stream_chat(
    body: StreamChatRequest, request: Request,
) -> StreamingResponse:
    """Stream LLM response token-by-token via SSE."""
    settings = request.app.state.settings

    # Determine which model endpoint to use
    base_url = settings.llm_base_url
    model_id = settings.llm_model_id

    async def event_stream() -> AsyncIterator[str]:
        messages = []
        if body.system_prompt:
            messages.append({
                "role": "system", "content": body.system_prompt,
            })
        for msg in body.messages:
            messages.append({"role": msg.role, "content": msg.content})

        payload = {
            "model": model_id,
            "messages": messages,
            "max_tokens": body.max_tokens,
            "temperature": body.temperature,
            "stream": True,
        }

        token_count = 0
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
                            if token:
                                token_count += 1
                                yield (
                                    f"event: token\n"
                                    f"data: {json.dumps(token)}\n\n"
                                )
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue

            yield (
                f"event: done\n"
                f"data: {json.dumps({'tokens': token_count})}\n\n"
            )

        except httpx.ConnectError:
            yield (
                f"event: error\n"
                f"data: {json.dumps('Cannot reach LLM server. Is llama-server running?')}\n\n"
            )
        except Exception as exc:
            logger.exception("Chat stream error: %s", exc)
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
