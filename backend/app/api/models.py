"""
Models API routes.

Exposes endpoints for listing registered model providers,
their capabilities, and health status.
"""

import time
from typing import Any

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Request

from app.models.base import GenerationRequest
from app.models.registry import ModelRegistry

router = APIRouter(prefix="/models", tags=["models"])


class ModelInferenceRequest(BaseModel):
    """Request payload for direct model inference testing."""

    prompt: str
    model_name: str | None = "general"
    system_prompt: str | None = None
    max_tokens: int = 1024
    temperature: float = 0.7


class ModelInferenceResponse(BaseModel):
    """Response payload for model inference."""

    text: str
    model_name: str
    provider: str
    tokens_used: int | None = None
    duration_ms: float
    fallback_used: bool = False
    metadata: dict[str, Any] = {}


@router.get("/")
def list_models(request: Request) -> dict[str, object]:
    """Return all registered model providers and their capabilities."""
    registry: ModelRegistry | None = getattr(request.app.state, "registry", None)
    if registry is None:
        raise HTTPException(status_code=503, detail="Model registry not initialized.")

    models = {}
    for name in registry.list_models():
        provider = registry.get(name)
        cap = provider.get_capabilities()
        provider_type = getattr(provider, "get_provider_type", lambda: "unknown")()
        base_url = getattr(provider, "get_base_url", lambda: None)()
        models[name] = {
            "provider_name": provider.get_name(),
            "provider_type": provider_type,
            "available": provider.is_available(),
            "local": True,
            "base_url": base_url,
            "capabilities": cap.model_dump(),
        }
    return {"models": models}


@router.get("/health")
def models_health(request: Request) -> dict[str, object]:
    """
    Health check for all registered model providers.

    Returns per-model status indicating whether the backing
    inference server is reachable and ready.

    Possible status values:
        ``available``     — server is reachable and healthy
        ``unavailable``   — server is down or refused the connection
        ``timeout``       — server did not respond in time
        ``misconfigured`` — server responded but health check failed
    """
    registry: ModelRegistry | None = getattr(request.app.state, "registry", None)
    if registry is None:
        raise HTTPException(status_code=503, detail="Model registry not initialized.")

    results = []
    for name in registry.list_models():
        provider = registry.get(name)
        provider_type = getattr(provider, "get_provider_type", lambda: "unknown")()

        # Use granular health_status() when available; fall back to is_available()
        health_fn = getattr(provider, "health_status", None)
        if health_fn is not None:
            status = health_fn()
        else:
            status = "available" if provider.is_available() else "unavailable"

        model_path = getattr(provider, "get_model_path", lambda: None)()

        results.append({
            "name": name,
            "provider": provider_type,
            "status": status,
            "local": True,
            "model_path": model_path,
        })
    return {"models": results}


@router.post("/inference", response_model=ModelInferenceResponse)
def model_inference(
    body: ModelInferenceRequest, request: Request
) -> ModelInferenceResponse:
    """Execute on-premise local model inference directly."""
    registry: ModelRegistry | None = getattr(request.app.state, "registry", None)
    if registry is None:
        raise HTTPException(status_code=503, detail="Model registry not initialized.")

    if not body.prompt.strip():
        raise HTTPException(status_code=422, detail="Prompt cannot be empty.")

    target_name = body.model_name or "general"
    try:
        provider = registry.get(target_name)
    except KeyError:
        raise HTTPException(
            status_code=404,
            detail=f"Model provider '{target_name}' not found.",
        )

    fallback_used = False
    if not provider.is_available():
        available = registry.get_available(preferred="local")
        if available is not None and available[1] is not provider:
            target_name, provider = available
            fallback_used = True
        else:
            raise HTTPException(
                status_code=503,
                detail=f"Model provider '{target_name}' is not currently reachable.",
            )

    start = time.monotonic()
    gen_req = GenerationRequest(
        prompt=body.prompt,
        system_prompt=body.system_prompt,
        max_tokens=body.max_tokens,
        temperature=body.temperature,
    )
    try:
        response = provider.generate(gen_req)
    except Exception as exc:
        available = registry.get_available(preferred="local")
        if not fallback_used and available is not None and available[1] is not provider:
            provider = available[1]
            response = provider.generate(gen_req)
            fallback_used = True
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Inference generation failed: {exc}",
            )

    duration_ms = round((time.monotonic() - start) * 1000, 2)
    provider_type = getattr(provider, "get_provider_type", lambda: "unknown")()

    return ModelInferenceResponse(
        text=response.text,
        model_name=response.model_name,
        provider=provider_type,
        tokens_used=response.tokens_used,
        duration_ms=duration_ms,
        fallback_used=fallback_used,
        metadata=response.metadata or {},
    )
