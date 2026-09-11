"""
Knowledge domain models.

Strongly typed Pydantic models for the Knowledge Base & RAG subsystem.

All chunking, retrieval, and citation operations use these models
to preserve provenance — every chunk traces back to its source
document, page, and section.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class IngestionStatus(str, enum.Enum):
    """Tracks the lifecycle of a document within the knowledge base."""

    PENDING = "pending"
    PROCESSING = "processing"
    CHUNKED = "chunked"
    EMBEDDED = "embedded"
    INDEXED = "indexed"
    FAILED = "failed"
    STALE = "stale"


class EvidenceQuality(str, enum.Enum):
    """Classification of retrieval evidence quality.

    Computed by application code from retrieval results — never
    generated or influenced by the LLM.
    """

    NO_EVIDENCE = "no_evidence"
    WEAK_EVIDENCE = "weak_evidence"
    SUFFICIENT_EVIDENCE = "sufficient_evidence"
    STRONG_EVIDENCE = "strong_evidence"


@dataclass(frozen=True)
class EmbeddingConfig:
    """Identifies the embedding configuration used to create an index.

    Two indexes are compatible only if their EmbeddingConfig matches.
    """

    provider: str = "tfidf"
    version: int = 1
    model_name: str = ""
    dimension: int = 512
    preprocessing_version: int = 1

    def fingerprint(self) -> str:
        """Stable string identifier for this configuration."""
        return (
            f"{self.provider}:v{self.version}:"
            f"{self.model_name}:d{self.dimension}:"
            f"p{self.preprocessing_version}"
        )


class KnowledgeChunk(BaseModel):
    """A single chunk of text extracted from a source document.

    Preserves full provenance so citations can be traced back to
    the exact source location.
    """

    chunk_id: str
    document_id: str
    text: str
    page_number: int | None = None
    section: str | None = None
    source: str = ""
    chunk_index: int = 0
    start_char: int = 0
    end_char: int = 0
    chunk_hash: str = ""
    vector_id: str = ""
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    metadata: dict[str, Any] = Field(default_factory=dict)


class KnowledgeDocument(BaseModel):
    """Tracks a document's presence in the knowledge base.

    This is *not* a copy of the Document model from the document
    intelligence subsystem — it records ingestion metadata and
    acts as the join between a source document and its chunks.
    """

    document_id: str
    filename: str
    file_type: str
    content_hash: str = ""
    chunk_count: int = 0
    ingestion_status: IngestionStatus = IngestionStatus.PENDING
    embedding_provider: str = ""
    embedding_version: int = 0
    chunking_version: int = 1
    ingested_at: str | None = None
    updated_at: str | None = None
    ingestion_time_ms: float = 0.0
    embedding_time_ms: float = 0.0
    error_info: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class RetrievalResult(BaseModel):
    """A single search result returned by the knowledge retriever.

    Includes the matched chunk, its relevance score, and full
    provenance information for citation building.
    """

    chunk: KnowledgeChunk
    score: float
    document_id: str
    filename: str
    page_number: int | None = None
    section: str | None = None


class Citation(BaseModel):
    """A citation referencing a specific location in a source document.

    Only built from actually retrieved evidence — never fabricated.
    """

    document_id: str = ""
    document: str
    page: int | None = None
    section: str | None = None
    chunk_id: str | None = None
    relevance_score: float | None = None


class RAGResponse(BaseModel):
    """Complete response from the RAG pipeline.

    Includes the generated answer, supporting citations,
    and performance metrics.
    """

    query: str
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    model_used: str = ""
    retrieval_count: int = 0
    retrieval_time_ms: float = 0.0
    generation_time_ms: float = 0.0
    total_time_ms: float = 0.0
    evidence_sufficient: bool = True
    evidence_quality: EvidenceQuality = EvidenceQuality.NO_EVIDENCE
    embedding_time_ms: float = 0.0
    context_construction_time_ms: float = 0.0
    similarity_threshold: float = 0.0
    candidates_count: int = 0
    metrics: RAGMetrics | None = None


class RAGMetrics(BaseModel):
    """Observability metrics for a single RAG request.

    Captured internally for audit/trace purposes.
    No telemetry is sent outside the machine.
    """

    query: str = ""
    embedding_time_ms: float = 0.0
    vector_search_time_ms: float = 0.0
    candidates_count: int = 0
    returned_count: int = 0
    similarity_threshold: float = 0.0
    evidence_quality: EvidenceQuality = EvidenceQuality.NO_EVIDENCE
    context_construction_time_ms: float = 0.0
    generation_time_ms: float = 0.0
    total_time_ms: float = 0.0
