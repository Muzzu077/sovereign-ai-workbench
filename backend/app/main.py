"""
Sovereign AI Workbench — FastAPI application entry point.

Initializes the model registry, tool registry, verifier registry,
audit service, document intelligence subsystem, knowledge base & RAG
subsystem, agent orchestrator, and wires up all API routes.

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
from app.tools.registry import ToolRegistry
from app.tools.calculator import CalculatorTool
from app.tools.file_reader import FileReaderTool
from app.agents.verifier import VerifierRegistry, CalculatorVerifier
from app.agents.orchestrator import AgentOrchestrator
from app.documents.processor import ProcessorRegistry
from app.documents.txt_processor import TxtProcessor
from app.documents.pdf_processor import PdfProcessor
from app.documents.docx_processor import DocxProcessor
from app.documents.store import DocumentStore
from app.knowledge.chunking import ChunkingConfig, ChunkingService
from app.knowledge.tfidf_embeddings import TfidfEmbeddingProvider
from app.knowledge.memory_store import InMemoryVectorStore
from app.knowledge.ingestion import KnowledgeIngestionService
from app.knowledge.retrieval import KnowledgeRetriever
from app.knowledge.rag_service import RAGService
from app.tools.rag_tool import KnowledgeSearchTool
from app.api import agent as agent_api
from app.api import files as files_api
from app.api import models as models_api
from app.api import documents as documents_api
from app.api import knowledge as knowledge_api

logger = logging.getLogger(__name__)


def _build_tool_registry(settings) -> ToolRegistry:
    """Create and populate the tool registry."""
    tool_registry = ToolRegistry()

    # Calculator — always available.
    tool_registry.register(CalculatorTool())

    # File reader — uses the configured data directory as workspace root.
    workspace = settings.data_dir
    # Ensure the workspace directory exists.
    workspace.mkdir(parents=True, exist_ok=True)
    tool_registry.register(FileReaderTool(workspace_root=workspace))

    return tool_registry


def _build_verifier_registry() -> VerifierRegistry:
    """Create and populate the verifier registry."""
    verifier_registry = VerifierRegistry()
    verifier_registry.register(CalculatorVerifier())
    return verifier_registry


def _build_processor_registry() -> ProcessorRegistry:
    """Build and return a ProcessorRegistry with all supported processors."""
    reg = ProcessorRegistry()
    reg.register(TxtProcessor())
    reg.register(PdfProcessor())
    reg.register(DocxProcessor())
    return reg


def create_app() -> FastAPI:
    """Application factory. Each call produces a fully independent app instance."""
    settings = get_settings()

    # Per-app-instance singletons
    model_registry = ModelRegistry()
    audit_service = AuditService(log_file=settings.audit_log_file)
    tool_registry = _build_tool_registry(settings)
    verifier_registry = _build_verifier_registry()
    processor_registry = _build_processor_registry()
    document_store = DocumentStore(upload_dir=settings.upload_dir)

    # Knowledge subsystem components (created once, wired during lifespan)
    chunking_config = ChunkingConfig(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        min_chunk_size=settings.min_chunk_size,
    )
    chunking_service = ChunkingService(config=chunking_config)
    embedding_provider = TfidfEmbeddingProvider(
        max_features=settings.embedding_dimension,
    )
    vector_store = InMemoryVectorStore()
    ingestion_service = KnowledgeIngestionService(
        chunking_service=chunking_service,
        embedding_provider=embedding_provider,
        vector_store=vector_store,
    )
    retriever = KnowledgeRetriever(
        embedding_provider=embedding_provider,
        vector_store=vector_store,
        ingestion_service=ingestion_service,
    )
    knowledge_search_tool = KnowledgeSearchTool(retriever=retriever)

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
            model_registry.register("general", provider)
        else:
            logger.info(
                "LLM disabled (SAW_LLM_ENABLED=false) — "
                "registering DummyLocalModel for development/testing."
            )
            model_registry.register("general", DummyLocalModel())

        # Wire up the orchestrator with all registries.
        orchestrator = AgentOrchestrator(
            registry=model_registry,
            audit_service=audit_service,
            tool_registry=tool_registry,
            verifier_registry=verifier_registry,
            default_model="general",
        )

        # Wire up the RAG service (needs the model provider)
        model_provider = model_registry.get("general")
        rag_service = RAGService(
            retriever=retriever,
            model_provider=model_provider,
        )

        # Store on app.state for dependency injection in routes
        app.state.registry = model_registry
        app.state.tool_registry = tool_registry
        app.state.orchestrator = orchestrator
        app.state.settings = settings
        app.state.audit_service = audit_service
        app.state.processor_registry = processor_registry
        app.state.document_store = document_store
        app.state.knowledge_ingestion = ingestion_service
        app.state.knowledge_retriever = retriever
        app.state.rag_service = rag_service
        app.state.knowledge_search_tool = knowledge_search_tool

        logger.info(
            "Sovereign AI Workbench started "
            "(tools=%s, processors=%s, upload_dir=%s, "
            "embedding=%s, vector_store=%s)",
            tool_registry.list_tools(),
            processor_registry.list_extensions(),
            settings.upload_dir,
            embedding_provider.get_name(),
            type(vector_store).__name__,
        )
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
        tools: ToolRegistry = request.app.state.tool_registry
        knowledge_ingest = getattr(request.app.state, "knowledge_ingestion", None)
        knowledge_docs = (
            len(knowledge_ingest.list_documents())
            if knowledge_ingest
            else 0
        )
        knowledge_chunks = vector_store.count()
        return {
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version": settings.app_version,
            "models_registered": reg.list_models(),
            "tools_registered": tools.list_tools(),
            "document_processors": processor_registry.list_extensions(),
            "knowledge_documents": knowledge_docs,
            "knowledge_chunks": knowledge_chunks,
            "embedding_provider": embedding_provider.get_name(),
        }

    # --- Route groups ---
    app.include_router(agent_api.router)
    app.include_router(files_api.router)
    app.include_router(models_api.router)
    app.include_router(documents_api.router)
    app.include_router(knowledge_api.router)

    return app


app = create_app()
