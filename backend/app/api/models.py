"""
Models API routes.

Exposes endpoints for listing registered model providers,
their capabilities, and health status.
"""

from fastapi import APIRouter, HTTPException, Request

from app.models.registry import ModelRegistry

router = APIRouter(prefix="/models", tags=["models"])


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
