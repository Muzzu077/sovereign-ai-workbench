"""
Application configuration.

Centralizes all environment-specific settings using pydantic-settings.
No secrets or environment-specific values are hardcoded here.
"""

from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Global application settings loaded from environment variables or .env file."""

    app_name: str = "Sovereign AI Workbench"
    app_version: str = "0.6.1"
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

    # --- Persistence ---
    knowledge_db_path: Path = Path("data/knowledge_base/knowledge.db")
    vector_storage_path: Path = Path("data/knowledge_base/vectors")
    document_db_path: Path = Path("data/documents.db")

    model_config = {
        "env_prefix": "SAW_",
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
