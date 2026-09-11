"""
Citation builder.

Builds Citation objects from retrieval results. Only cites
actually retrieved evidence — never fabricates citations.

Audited for citation integrity:
- Every citation carries the source document_id, filename, page, section,
  chunk_id, and relevance score.
- Deduplication occurs at the chunk location level (document_id, page, section).
- Relevance scores are preserved and rounded.
"""

from __future__ import annotations

from app.knowledge.models import Citation, RetrievalResult


def build_citations(results: list[RetrievalResult]) -> list[Citation]:
    """Build citations from retrieval results.

    Each citation traces back to a specific document, page, and
    section. Chunks from the same document at the same page and
    section are deduplicated, preserving the highest relevance score.

    Args:
        results: Retrieval results ordered by relevance.

    Returns:
        List of Citation objects, deduplicated.
    """
    seen: set[tuple[str, int | None, str | None]] = set()
    citations: list[Citation] = []

    for result in results:
        # Use document_id or filename for the location key
        loc_key = (
            result.document_id or result.filename,
            result.page_number,
            result.section,
        )
        if loc_key in seen:
            continue
        seen.add(loc_key)

        citations.append(
            Citation(
                document_id=result.document_id,
                document=result.filename,
                page=result.page_number,
                section=result.section,
                chunk_id=result.chunk.chunk_id,
                relevance_score=round(result.score, 4),
            )
        )

    return citations
