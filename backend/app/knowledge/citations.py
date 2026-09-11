"""
Citation builder.

Builds Citation objects from retrieval results. Only cites
actually retrieved evidence — never fabricates citations.
"""

from __future__ import annotations

from app.knowledge.models import Citation, RetrievalResult


def build_citations(results: list[RetrievalResult]) -> list[Citation]:
    """Build citations from retrieval results.

    Each citation traces back to a specific document, page, and
    section. Duplicate documents are merged only if they reference
    the same page and section.

    Args:
        results: Retrieval results ordered by relevance.

    Returns:
        List of Citation objects, deduplicated.
    """
    seen: set[tuple[str, int | None, str | None]] = set()
    citations: list[Citation] = []

    for result in results:
        key = (result.filename, result.page_number, result.section)
        if key in seen:
            continue
        seen.add(key)

        citations.append(
            Citation(
                document=result.filename,
                page=result.page_number,
                section=result.section,
                chunk_id=result.chunk.chunk_id,
                relevance_score=round(result.score, 4),
            )
        )

    return citations
