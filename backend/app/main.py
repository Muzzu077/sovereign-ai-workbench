"""
Sovereign AI Workbench — FastAPI application entry point.

Initializes the model registry, audit service, agent orchestrator,
and wires up all API routes.

Model provider selection:
- When SAW_LLM_ENABLED=true (default), registers a real LlamaCppProvider
  that talks to a local llama.cpp server.
- When SAW_LLM_ENABLED=false, registers DummyLocalModel (for testing
  without a running LLM server).
"""

import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from datetime import datetime, timezone

from fastapi import FastAPI, Request

from app.config import get_settings
from app.models.registry import ModelRegistry
from app.models.local import DummyLocalModel
from app.models.llama_cpp_provider import LlamaCppProvider
from app.security.audit import AuditService
from app.agents.orchestrator import AgentOrchestrator
from app.api import agent as agent_api
from app.api import files as files_api
from app.api import models as models_api

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Application factory. Each call produces a fully independent app instance."""
    settings = get_settings()

    # Per-app-instance singletons
    registry = ModelRegistry()
    audit_service = AuditService(log_file=settings.audit_log_file)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        """Startup / shutdown lifecycle hook."""
        if settings.llm_enabled:
            logger.info(
                "LLM enabled — registering LlamaCppProvider "
                "(base_url=%s, model_id=%s, model_path=%s)",
                settings.llm_base_url,
                settings.llm_model_id,
                settings.llm_model_path,
            )
            provider = LlamaCppProvider(
                base_url=settings.llm_base_url,
                model_id=settings.llm_model_id,
                timeout=settings.llm_timeout,
                model_path=settings.llm_model_path,
            )
            registry.register("general", provider)
        else:
            logger.info(
                "LLM disabled (SAW_LLM_ENABLED=false) — "
                "registering DummyLocalModel for development/testing."
            )
            registry.register("general", DummyLocalModel())

        # Wire up the orchestrator
        orchestrator = AgentOrchestrator(
            registry=registry,
            audit_service=audit_service,
            default_model="general",
        )

        # Store on app.state for dependency injection in routes
        app.state.registry = registry
        app.state.orchestrator = orchestrator
        app.state.settings = settings

        logger.info("Sovereign AI Workbench started")
        yield
        logger.info("Sovereign AI Workbench shutting down")

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "On-premise agentic AI workbench using open-weight multimodal LLMs "
            "for confidential industrial work. SIH 2026 — Problem ID 26117."
        ),
        lifespan=lifespan,
    )

    # --- Root routes ---
    @app.get("/", tags=["root"])
    def root() -> dict[str, str]:
        """Root endpoint — confirms the backend is running."""
        return {
            "service": settings.app_name,
            "version": settings.app_version,
            "status": "running",
            "message": "Sovereign AI Workbench backend is operational.",
        }

    @app.get("/health", tags=["root"])
    def health(request: Request) -> dict[str, object]:
        """Health check endpoint."""
        reg: ModelRegistry = request.app.state.registry
        return {
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version": settings.app_version,
            "models_registered": reg.list_models(),
        }

    # --- Route groups ---
    app.include_router(agent_api.router)
    app.include_router(files_api.router)
    app.include_router(models_api.router)

    return app


app = create_app()
