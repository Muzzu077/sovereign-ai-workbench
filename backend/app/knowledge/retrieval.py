"""
Knowledge retriever.

Retrieves the most relevant chunks from the knowledge base
for a given query. Returns RetrievalResult objects with full
provenance for downstream citation building.

Features:
- Configurable similarity threshold filtering
- Evidence quality classification (computed, never LLM-generated)
- Full provenance reconstruction for citations
"""

from __future__ import annotations

import logging
import time

from app.knowledge.embeddings import EmbeddingProvider
from app.knowledge.ingestion import KnowledgeIngestionService
from app.knowledge.models import (
    EvidenceQuality,
    KnowledgeChunk,
    RetrievalResult,
)
from app.knowledge.vector_store import VectorStore

logger = logging.getLogger(__name__)

# Default thresholds for evidence quality classification
_WEAK_THRESHOLD = 0.10
_SUFFICIENT_THRESHOLD = 0.20
_STRONG_THRESHOLD = 0.35
_STRONG_MIN_COUNT = 2


def classify_evidence(
    results: list[RetrievalResult | VectorStoreResult],
    similarity_threshold: float | None = None,
    threshold: float | None = None,
) -> EvidenceQuality:
    """Classify the quality of retrieved evidence.

    This is computed from retrieval scores by application code.
    The LLM never generates or modifies these classifications.

    Args:
        results: Retrieved results (already filtered by threshold).
        similarity_threshold: The threshold used for filtering (or `threshold`).

    Returns:
        EvidenceQuality enum value.
    """
    effective_thresh = threshold if threshold is not None else (similarity_threshold or 0.0)
    # Filter out anything strictly below effective_thresh if not already filtered
    valid_results = [r for r in results if r.score >= effective_thresh]
    if not valid_results:
        return EvidenceQuality.NO_EVIDENCE

    scores = [r.score for r in valid_results]
    max_score = max(scores)
    above_sufficient = sum(1 for s in scores if s >= _SUFFICIENT_THRESHOLD)

    if max_score < _WEAK_THRESHOLD:
        return EvidenceQuality.WEAK_EVIDENCE

    if above_sufficient >= _STRONG_MIN_COUNT and max_score >= _STRONG_THRESHOLD:
        return EvidenceQuality.STRONG_EVIDENCE

    if max_score >= _SUFFICIENT_THRESHOLD:
        return EvidenceQuality.SUFFICIENT_EVIDENCE

    return EvidenceQuality.WEAK_EVIDENCE


class KnowledgeRetriever:
    """Retrieves relevant chunks from the knowledge base.

    Args:
        embedding_provider: Used to embed the query text.
        vector_store: Searched for similar vectors.
        ingestion_service: Provides chunk metadata lookup.
        default_top_k: Default number of results to return.
        similarity_threshold: Minimum similarity score to include a result.
    """

    def __init__(
        self,
        embedding_provider: EmbeddingProvider,
        vector_store: VectorStore,
        ingestion_service: KnowledgeIngestionService,
        *,
        default_top_k: int = 5,
        similarity_threshold: float = 0.05,
    ) -> None:
        self._embedder = embedding_provider
        self._store = vector_store
        self._ingestion = ingestion_service
        self._default_top_k = default_top_k
        self._similarity_threshold = similarity_threshold

    @property
    def similarity_threshold(self) -> float:
        return self._similarity_threshold

    def retrieve(
        self,
        query: str,
        top_k: int | None = None,
        similarity_threshold: float | None = None,
    ) -> tuple[list[RetrievalResult], float]:
        """Retrieve the top-k most relevant chunks for a query.

        Args:
            query: The search query text.
            top_k: Maximum number of results to return.
            similarity_threshold: Override the default threshold.

        Returns:
            Tuple of (results ordered by relevance, retrieval_time_ms).
        """
        start = time.monotonic()
        k = top_k if top_k is not None else self._default_top_k
        threshold = (
            similarity_threshold
            if similarity_threshold is not None
            else self._similarity_threshold
        )

        if not query.strip():
            return [], 0.0

        if self._store.count() == 0:
            return [], 0.0

        # Embed the query
        query_vector = self._embedder.embed(query)

        # Search vector store (request extra candidates for threshold filtering)
        vs_results = self._store.search(query_vector, top_k=k * 2)

        # Build RetrievalResults with full provenance, applying threshold
        results: list[RetrievalResult] = []
        for vsr in vs_results:
            if vsr.score < threshold:
                continue

            chunk = self._ingestion.get_chunk(vsr.chunk_id)
            if chunk is None:
                # If chunk wasn't found in memory cache, construct lightweight fallback from vector store metadata
                meta = vsr.metadata or {}
                chunk = KnowledgeChunk(
                    chunk_id=vsr.chunk_id,
                    document_id=meta.get("document_id", ""),
                    chunk_index=meta.get("chunk_index", 0),
                    text=meta.get("text", ""),
                    page_number=meta.get("page_number"),
                    section=meta.get("section"),
                    source=meta.get("source", ""),
                )

            knowledge_doc = self._ingestion.get_document(chunk.document_id)
            filename = (
                knowledge_doc.filename
                if knowledge_doc
                else vsr.metadata.get("filename", "")
            )

            results.append(
                RetrievalResult(
                    chunk=chunk,
                    score=vsr.score,
                    document_id=chunk.document_id,
                    filename=filename,
                    page_number=chunk.page_number,
                    section=chunk.section,
                )
            )

            if len(results) >= k:
                break

        retrieval_time = (time.monotonic() - start) * 1000

        logger.info(
            "Retrieved %d results for query '%s...' in %.1fms "
            "(threshold=%.3f, candidates=%d)",
            len(results),
            query[:50],
            retrieval_time,
            threshold,
            len(vs_results),
        )

        return results, retrieval_time
