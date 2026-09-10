"""
Knowledge retriever.

Retrieves the most relevant chunks from the knowledge base
for a given query. Returns RetrievalResult objects with full
provenance for downstream citation building.
"""

from __future__ import annotations

import logging
import time

from app.knowledge.embeddings import EmbeddingProvider
from app.knowledge.ingestion import KnowledgeIngestionService
from app.knowledge.models import KnowledgeChunk, RetrievalResult
from app.knowledge.vector_store import VectorStore

logger = logging.getLogger(__name__)


class KnowledgeRetriever:
    """Retrieves relevant chunks from the knowledge base.

    Args:
        embedding_provider: Used to embed the query text.
        vector_store: Searched for similar vectors.
        ingestion_service: Provides chunk metadata lookup.
    """

    def __init__(
        self,
        embedding_provider: EmbeddingProvider,
        vector_store: VectorStore,
        ingestion_service: KnowledgeIngestionService,
    ) -> None:
        self._embedder = embedding_provider
        self._store = vector_store
        self._ingestion = ingestion_service

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
    ) -> tuple[list[RetrievalResult], float]:
        """Retrieve the top-k most relevant chunks for a query.

        Args:
            query: The search query text.
            top_k: Maximum number of results to return.

        Returns:
            Tuple of (results ordered by relevance, retrieval_time_ms).
        """
        start = time.monotonic()

        if not query.strip():
            return [], 0.0

        if self._store.count() == 0:
            return [], 0.0

        # Embed the query
        query_vector = self._embedder.embed(query)

        # Search vector store
        vs_results = self._store.search(query_vector, top_k=top_k)

        # Build RetrievalResults with full provenance
        results: list[RetrievalResult] = []
        for vsr in vs_results:
            chunk = self._ingestion.get_chunk(vsr.chunk_id)
            if chunk is None:
                continue

            # Look up filename from ingestion service
            knowledge_doc = self._ingestion.get_document(chunk.document_id)
            filename = knowledge_doc.filename if knowledge_doc else ""

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

        retrieval_time = (time.monotonic() - start) * 1000

        logger.info(
            "Retrieved %d results for query '%s...' in %.1fms",
            len(results),
            query[:50],
            retrieval_time,
        )

        return results, retrieval_time
