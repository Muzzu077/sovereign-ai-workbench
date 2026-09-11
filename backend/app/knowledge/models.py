"""
Knowledge domain models.

Strongly typed Pydantic models for the Knowledge Base & RAG subsystem.

All chunking, retrieval, and citation operations use these models
to preserve provenance — every chunk traces back to its source
document, page, and section.
"""

from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class IngestionStatus(str, enum.Enum):
    """Tracks the lifecycle of a document within the knowledge base."""

    PENDING = "pending"
    CHUNKED = "chunked"
    EMBEDDED = "embedded"
    INDEXED = "indexed"
    FAILED = "failed"


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
    chunk_count: int = 0
    ingestion_status: IngestionStatus = IngestionStatus.PENDING
    ingested_at: str | None = None
    ingestion_time_ms: float = 0.0
    embedding_time_ms: float = 0.0
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
