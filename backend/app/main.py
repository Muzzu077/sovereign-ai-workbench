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
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models.registry import ModelRegistry
from app.models.local import DummyLocalModel
from app.models.llama_cpp_provider import LlamaCppProvider
from app.security.audit import AuditService
from app.security.network_monitor import NetworkMonitor
from app.tools.registry import ToolRegistry
from app.tools.calculator import CalculatorTool
from app.tools.file_reader import FileReaderTool
from app.tools.ocr_tool import OCRTool
from app.tools.document_tool import DocumentGenerationTool
from app.tools.file_tool import FileManagementTool
from app.tools.code_tool import CodeExecutionTool
from app.agents.verifier import VerifierRegistry, CalculatorVerifier
from app.agents.orchestrator import AgentOrchestrator
from app.documents.processor import ProcessorRegistry
from app.documents.txt_processor import TxtProcessor
from app.documents.pdf_processor import PdfProcessor
from app.documents.docx_processor import DocxProcessor
from app.documents.store import DocumentStore
from app.documents.persistence import DocumentMetadataStore
from app.knowledge.chunking import ChunkingConfig, ChunkingService
from app.knowledge.tfidf_embeddings import TfidfEmbeddingProvider
from app.knowledge.embeddings import EmbeddingProvider
from app.knowledge.persistence import KnowledgeMetadataStore
from app.knowledge.persistent_store import PersistentVectorStore
from app.knowledge.ingestion import KnowledgeIngestionService
from app.knowledge.retrieval import KnowledgeRetriever
from app.knowledge.rag_service import RAGService
from app.tools.rag_tool import KnowledgeSearchTool
from app.api import agent as agent_api
from app.api import files as files_api
from app.api import models as models_api
from app.api import documents as documents_api
from app.api import knowledge as knowledge_api
from app.api import execution as execution_api
from app.api import codegen as codegen_api
from app.api import studio as studio_api
from app.api import workflows as workflows_api
from app.api import chat as chat_api
from app.api import logs as logs_api
from app.services.export_service import ExportService
from app.services.approval_workflow import ApprovalWorkflowService
from app.services.hardware import HardwareDetector
from app.services.benchmark import BenchmarkRunner

logger = logging.getLogger(__name__)


def _build_embedding_provider(settings) -> EmbeddingProvider:
    """Create the configured embedding provider.

    Returns TfidfEmbeddingProvider (default) or LocalNeuralEmbeddingProvider
    based on SAW_EMBEDDING_PROVIDER.
    """
    if settings.embedding_provider == "neural":
        from app.knowledge.neural_embeddings import LocalNeuralEmbeddingProvider

        return LocalNeuralEmbeddingProvider(
            model_path=settings.neural_model_path,
            model_name=settings.neural_model_name,
            device=settings.neural_device,
            fallback_to_cpu=settings.neural_fallback_to_cpu,
            max_seq_length=settings.neural_max_seq_length,
            batch_size=settings.neural_batch_size,
            normalize=settings.neural_normalize,
        )

    return TfidfEmbeddingProvider(
        max_features=settings.embedding_dimension,
    )


def _build_tool_registry(settings) -> ToolRegistry:
    """Create and populate the tool registry."""
    tool_registry = ToolRegistry()

    # Calculator — always available.
    tool_registry.register(CalculatorTool())

    # File reader — uses the configured data directory as workspace root.
    workspace = settings.data_dir
    workspace.mkdir(parents=True, exist_ok=True)
    tool_registry.register(FileReaderTool(workspace_root=workspace))

    # File manager — read/write/list/info operations within workspace.
    tool_registry.register(FileManagementTool(workspace_root=workspace))

    # OCR — local Tesseract-based OCR for scanned PDFs.
    tool_registry.register(OCRTool(
        workspace_root=settings.upload_dir,
    ))

    # Document generator — markdown to DOCX conversion.
    tool_registry.register(DocumentGenerationTool(
        outputs_dir=settings.outputs_dir,
    ))

    # Code execution — sandboxed Python execution via Docker.
    tool_registry.register(CodeExecutionTool())

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
    document_meta_store = DocumentMetadataStore(db_path=settings.document_db_path)
    document_store = DocumentStore(
        upload_dir=settings.upload_dir,
        metadata_store=document_meta_store,
    )
    network_monitor = NetworkMonitor(
        configured_endpoints={
            **({"llm_server": str(settings.llm_base_url)} if settings.llm_enabled else {}),
            "coder_server": str(settings.coder_base_url),
        }
    )

    # Knowledge subsystem components with persistence
    chunking_config = ChunkingConfig(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        min_chunk_size=settings.min_chunk_size,
    )
    chunking_service = ChunkingService(config=chunking_config)
    embedding_provider = _build_embedding_provider(settings)
    embedding_config = embedding_provider.get_config()

    # Determine similarity threshold: use neural-specific threshold when
    # the neural provider is active, otherwise use the default.
    effective_threshold = settings.similarity_threshold
    if settings.embedding_provider == "neural":
        effective_threshold = settings.neural_similarity_threshold

    meta_store = KnowledgeMetadataStore(db_path=settings.knowledge_db_path)
    vector_store = PersistentVectorStore(
        storage_dir=settings.vector_storage_path,
        expected_dimension=embedding_config.dimension,
        embedding_fingerprint=embedding_config.fingerprint(),
    )

    ingestion_service = KnowledgeIngestionService(
        chunking_service=chunking_service,
        embedding_provider=embedding_provider,
        vector_store=vector_store,
        metadata_store=meta_store,
        embedding_config=embedding_config,
    )
    retriever = KnowledgeRetriever(
        embedding_provider=embedding_provider,
        vector_store=vector_store,
        ingestion_service=ingestion_service,
        default_top_k=settings.retrieval_top_k,
        similarity_threshold=effective_threshold,
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
            model_registry.register("local", DummyLocalModel())
        else:
            logger.info(
                "LLM disabled (SAW_LLM_ENABLED=false) — "
                "registering DummyLocalModel for development/testing."
            )
            model_registry.register("general", DummyLocalModel())
            model_registry.register("local", DummyLocalModel())

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
            model_registry=model_registry,
            default_similarity_threshold=settings.similarity_threshold,
        )

        # Store on app.state for dependency injection in routes
        app.state.registry = model_registry
        app.state.tool_registry = tool_registry
        app.state.orchestrator = orchestrator
        app.state.settings = settings
        app.state.audit_service = audit_service
        app.state.processor_registry = processor_registry
        app.state.document_store = document_store
        app.state.knowledge_metadata = meta_store
        app.state.knowledge_ingestion = ingestion_service
        app.state.knowledge_retriever = retriever
        app.state.rag_service = rag_service
        app.state.knowledge_search_tool = knowledge_search_tool

        # Approval-note workflow (uses export, RAG, document store, audit)
        export_service = ExportService()
        approval_workflow = ApprovalWorkflowService(
            registry=model_registry,
            retriever=retriever,
            ingestion_service=ingestion_service,
            document_store=document_store,
            export_service=export_service,
            audit_service=audit_service,
        )
        app.state.export_service = export_service
        app.state.approval_workflow = approval_workflow

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
        # Clean shutdown: close metadata stores
        meta_store.close()
        document_meta_store.close()
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

    # --- CORS middleware (dev-safe, restrict in production) ---
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
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
        """Health check endpoint.

        Returns comprehensive health status including all subsystems:
        models, tools, documents, knowledge/vectors, audit, and
        network compliance.
        """
        reg: ModelRegistry = request.app.state.registry
        tools: ToolRegistry = request.app.state.tool_registry
        knowledge_ingest = getattr(request.app.state, "knowledge_ingestion", None)
        knowledge_docs = (
            len(knowledge_ingest.list_documents())
            if knowledge_ingest
            else 0
        )
        knowledge_chunks = vector_store.count()

        # Subsystem health details
        vector_health = vector_store.get_health_info()
        doc_health = document_store.get_store_health()
        audit_health = audit_service.get_health()
        network_compliance = network_monitor.check_compliance()
        embedding_health = (
            embedding_provider.get_health_info()
            if hasattr(embedding_provider, "get_health_info")
            else {"embedding_provider": embedding_provider.get_name()}
        )

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
            "subsystems": {
                "vector_store": vector_health,
                "document_store": doc_health,
                "audit": audit_health,
                "network": network_compliance,
                "embeddings": embedding_health,
            },
        }

    @app.get("/hardware", tags=["root"])
    def hardware_telemetry() -> dict[str, object]:
        """Hardware detection and telemetry endpoint.

        Returns comprehensive hardware information including CPU, GPU,
        memory, disk, and inference capability assessment.
        """
        detector = HardwareDetector(data_dir=settings.data_dir)
        snapshot = detector.detect()
        return snapshot.model_dump()

    @app.post("/benchmark", tags=["root"])
    def run_benchmark() -> dict[str, object]:
        """Run offline benchmarks on chunking and embedding subsystems.

        Returns throughput/latency metrics for the local inference
        pipeline components. Does NOT require a running LLM server.
        """
        runner = BenchmarkRunner(
            chunking_service=chunking_service,
            embedding_provider=embedding_provider,
        )
        profile = runner.run_all()
        return profile.model_dump()

    # --- Route groups ---
    app.include_router(agent_api.router)
    app.include_router(files_api.router)
    app.include_router(models_api.router)
    app.include_router(documents_api.router)
    app.include_router(knowledge_api.router)
    app.include_router(execution_api.router)
    app.include_router(codegen_api.router)
    app.include_router(studio_api.router)
    app.include_router(workflows_api.router)
    app.include_router(chat_api.router)
    app.include_router(logs_api.router)

    return app


app = create_app()
