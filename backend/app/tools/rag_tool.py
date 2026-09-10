"""
Knowledge search tool for the Agent Core.

Allows the agent to query the local knowledge base during task
execution. Returns retrieved evidence with provenance for the
agent to incorporate into its response.
"""

from __future__ import annotations

import logging
from typing import Any

from app.knowledge.retrieval import KnowledgeRetriever

logger = logging.getLogger(__name__)


class KnowledgeSearchTool:
    """Agent tool for searching the local knowledge base.

    Registered in the tool registry under the name 'knowledge_search'.
    The agent can invoke this tool to retrieve relevant evidence
    from ingested documents.
    """

    name: str = "knowledge_search"
    description: str = (
        "Search the local knowledge base for information relevant to a query. "
        "Returns document excerpts with source attribution."
    )

    def __init__(self, retriever: KnowledgeRetriever) -> None:
        self._retriever = retriever

    def execute(
        self, query: str, top_k: int = 5
    ) -> dict[str, Any]:
        """Execute a knowledge search.

        Args:
            query: Natural language query.
            top_k: Number of results to return.

        Returns:
            Dictionary with results and metadata.
        """
        if not query.strip():
            return {
                "tool": self.name,
                "query": query,
                "results": [],
                "error": "Empty query",
            }

        try:
            results, retrieval_time = self._retriever.retrieve(
                query=query, top_k=top_k
            )
        except Exception as exc:
            logger.error("Knowledge search failed: %s", exc)
            return {
                "tool": self.name,
                "query": query,
                "results": [],
                "error": str(exc),
            }

        return {
            "tool": self.name,
            "query": query,
            "results": [
                {
                    "text": r.chunk.text,
                    "document": r.filename,
                    "page": r.page_number,
                    "section": r.section,
                    "score": round(r.score, 4),
                }
                for r in results
            ],
            "retrieval_time_ms": round(retrieval_time, 2),
        }
