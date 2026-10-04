"""
Application configuration.

Centralizes all environment-specific settings using pydantic-settings.
No secrets or environment-specific values are hardcoded here.
"""

from pathlib import Path
from urllib.parse import urlparse

from pydantic import model_validator
from pydantic_settings import BaseSettings


# Hostnames considered local/loopback — must match network_monitor._LOCAL_HOSTS.
_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", "0.0.0.0"})


def _is_loopback(url: str) -> bool:
    """Return True if *url* points to a loopback address."""
    try:
        host = (urlparse(url).hostname or "").lower()
        return host in _LOOPBACK_HOSTS
    except Exception:
        return False


class Settings(BaseSettings):
    """Global application settings loaded from environment variables or .env file."""

    app_name: str = "Sovereign AI Workbench"
    app_version: str = "0.7.0"
    debug: bool = False

    # Paths
    data_dir: Path = Path("data")
    documents_dir: Path = Path("data/documents")
    knowledge_base_dir: Path = Path("data/knowledge_base")
    outputs_dir: Path = Path("data/outputs")
    sandbox_dir: Path = Path("sandbox")
    models_dir: Path = Path("models")

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Audit
    audit_log_file: Path = Path("data/audit.log")

    # --- Document Intelligence ---
    upload_dir: Path = Path("data/uploads")
    max_upload_size: int = 50 * 1024 * 1024       # 50 MB
    max_pdf_pages: int = 200
    max_extracted_characters: int = 500_000        # 500 K chars
    allowed_extensions: list[str] = ["txt", "pdf", "docx"]

    # --- Local LLM provider ---
    llm_provider: str = "llama_cpp"
    llm_base_url: str = "http://127.0.0.1:8080"
    llm_model_id: str = "gemma-3-4b-it"
    llm_model_path: str = "models/gemma-3-4b-it-Q4_K_M.gguf"
    llm_mmproj_path: str = "models/mmproj-gemma-3-4b-it-f16.gguf"
    llm_timeout: int = 120
    llm_enabled: bool = True

    # --- Code generation LLM (second model) ---
    coder_base_url: str = "http://127.0.0.1:9090"
    coder_model_id: str = "qwen3-4b"

    # --- Knowledge Base & RAG ---
    chunk_size: int = 800
    chunk_overlap: int = 100
    min_chunk_size: int = 50
    embedding_dimension: int = 512
    retrieval_top_k: int = 5
    similarity_threshold: float = 0.05
    max_context_chars: int = 5000

    # --- Embedding provider ---
    embedding_provider: str = "tfidf"
    embedding_version: int = 1

    # --- Neural embedding provider (used when embedding_provider="neural") ---
    neural_model_path: Path = Path("models/embeddings/all-MiniLM-L6-v2")
    neural_model_name: str = "all-MiniLM-L6-v2"
    neural_device: str = "cpu"
    neural_fallback_to_cpu: bool = False
    neural_batch_size: int = 64
    neural_normalize: bool = True
    neural_max_seq_length: int = 256
    neural_similarity_threshold: float = 0.25

    # --- Sandbox execution ---
    allow_unsandboxed_execution: bool = False
    sandbox_memory_limit: str = "128m"
    sandbox_cpu_limit: str = "0.5"
    sandbox_pids_limit: int = 64
    sandbox_timeout_max: int = 30
    sandbox_docker_image: str = "python:3.11-alpine"

    # --- Persistence ---
    knowledge_db_path: Path = Path("data/knowledge_base/knowledge.db")
    vector_storage_path: Path = Path("data/knowledge_base/vectors")
    document_db_path: Path = Path("data/documents.db")

    model_config = {
        "env_prefix": "SAW_",
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }

    @model_validator(mode="after")
    def _enforce_loopback_urls(self) -> "Settings":
        """Reject non-loopback base URLs to enforce air-gap compliance.

        This prevents an operator from accidentally pointing
        ``SAW_LLM_BASE_URL`` or ``SAW_CODER_BASE_URL`` to an external
        host, which would silently break the air-gap guarantee.
        """
        for field_name in ("llm_base_url", "coder_base_url"):
            url = getattr(self, field_name)
            if not _is_loopback(url):
                raise ValueError(
                    f"Air-gap violation: {field_name}={url!r} is not a "
                    f"loopback address. Only localhost/127.0.0.1/::1 "
                    f"endpoints are allowed."
                )
        return self


def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
