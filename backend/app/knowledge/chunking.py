"""
Knowledge chunking service.

Splits a normalized Document into KnowledgeChunks while preserving
full provenance (document_id, page_number, source, section).

Strategy:
1. Process pages individually to preserve page boundaries.
2. Within each page, prefer splitting on paragraph boundaries
   (double newlines), then sentence boundaries, then hard splits.
3. Apply configurable chunk_size and overlap.
4. Assign deterministic chunk_ids based on document_id + chunk_index
   to prevent duplicate chunks on re-ingestion.
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass

from app.documents.models import Document
from app.knowledge.models import KnowledgeChunk

logger = logging.getLogger(__name__)

# Regex patterns for boundary detection
_PARAGRAPH_BOUNDARY = re.compile(r"\n\s*\n")
_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+")
_SECTION_HEADER = re.compile(
    r"^(?:(?:\d+\.)+\d*|[A-Z][A-Z\s]{2,}:?|Section\s+\d+|Chapter\s+\d+)",
    re.MULTILINE,
)


@dataclass
class ChunkingConfig:
    """Configuration for the chunking service."""

    chunk_size: int = 800
    chunk_overlap: int = 100
    min_chunk_size: int = 50

    def __post_init__(self) -> None:
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError(
                f"chunk_overlap ({self.chunk_overlap}) must be less than "
                f"chunk_size ({self.chunk_size})"
            )


def _make_chunk_id(document_id: str, chunk_index: int) -> str:
    """Generate a deterministic chunk ID.

    Same document + same chunk_index always produces the same ID,
    enabling idempotent re-ingestion and deduplication.
    """
    raw = f"{document_id}::{chunk_index}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _detect_section(text: str) -> str | None:
    """Try to detect a section header at the start of a text block."""
    for line in text.split("\n")[:3]:
        stripped = line.strip()
        if stripped and _SECTION_HEADER.match(stripped):
            return stripped[:100]
    return None


def _split_text_into_segments(
    text: str, chunk_size: int, overlap: int, min_size: int
) -> list[tuple[int, int, str]]:
    """Split text into overlapping segments.

    Returns list of (start_char, end_char, segment_text) tuples.

    Strategy:
    1. Try paragraph boundaries first (double newlines).
    2. If a paragraph is too large, split on sentence boundaries.
    3. If a sentence is too large, hard-split at chunk_size.
    """
    if not text.strip():
        return []

    segments: list[tuple[int, int, str]] = []
    # Split into paragraphs first
    paragraphs: list[tuple[int, str]] = []
    for m in re.finditer(r"(?s)(.*?)(?:\n\s*\n|$)", text):
        para = m.group(1).strip()
        if para:
            paragraphs.append((m.start(), para))

    if not paragraphs:
        paragraphs = [(0, text.strip())]

    current_text = ""
    current_start = 0

    for para_start, para in paragraphs:
        # If adding this paragraph would exceed chunk_size, flush
        if current_text and len(current_text) + len(para) + 2 > chunk_size:
            if len(current_text) >= min_size:
                segments.append((
                    current_start,
                    current_start + len(current_text),
                    current_text,
                ))
            # Start new chunk with overlap
            if overlap > 0 and len(current_text) > overlap:
                overlap_text = current_text[-overlap:]
                current_text = overlap_text + "\n\n" + para
                current_start = para_start - overlap
            else:
                current_text = para
                current_start = para_start
        elif not current_text:
            current_text = para
            current_start = para_start
        else:
            current_text += "\n\n" + para

        # Handle paragraphs larger than chunk_size
        while len(current_text) > chunk_size:
            # Try sentence boundary
            split_point = chunk_size
            sentence_matches = list(
                _SENTENCE_BOUNDARY.finditer(current_text[:chunk_size + 50])
            )
            if sentence_matches:
                # Use the last sentence boundary before chunk_size
                best = None
                for m in sentence_matches:
                    if m.end() <= chunk_size:
                        best = m
                if best:
                    split_point = best.end()

            segment = current_text[:split_point].strip()
            if len(segment) >= min_size:
                segments.append((
                    current_start,
                    current_start + split_point,
                    segment,
                ))

            # Advance with overlap
            advance = max(split_point - overlap, 1)
            current_text = current_text[advance:].strip()
            current_start += advance

    # Flush remaining
    if current_text.strip() and len(current_text.strip()) >= min_size:
        segments.append((
            current_start,
            current_start + len(current_text),
            current_text.strip(),
        ))

    return segments


class ChunkingService:
    """Splits Documents into KnowledgeChunks with provenance."""

    def __init__(self, config: ChunkingConfig | None = None) -> None:
        self._config = config or ChunkingConfig()

    @property
    def config(self) -> ChunkingConfig:
        return self._config

    def chunk_document(self, document: Document) -> list[KnowledgeChunk]:
        """Chunk a normalized Document into KnowledgeChunks.

        Processes pages individually to preserve page_number provenance.
        For single-page documents (TXT, DOCX), uses the full text.

        Args:
            document: A normalized Document from the document intelligence
                subsystem.

        Returns:
            List of KnowledgeChunks with full provenance.
        """
        chunks: list[KnowledgeChunk] = []
        chunk_index = 0
        seen_ids: set[str] = set()

        if document.pages:
            for page in document.pages:
                page_chunks = self._chunk_page(
                    text=page.text,
                    document_id=document.document_id,
                    page_number=page.page_number,
                    source=page.source,
                    start_index=chunk_index,
                )
                for chunk in page_chunks:
                    if chunk.chunk_id not in seen_ids:
                        seen_ids.add(chunk.chunk_id)
                        chunks.append(chunk)
                        chunk_index += 1
        elif document.text:
            # Fallback: no page structure, use full text
            page_chunks = self._chunk_page(
                text=document.text,
                document_id=document.document_id,
                page_number=1,
                source="text_extraction",
                start_index=chunk_index,
            )
            for chunk in page_chunks:
                if chunk.chunk_id not in seen_ids:
                    seen_ids.add(chunk.chunk_id)
                    chunks.append(chunk)
                    chunk_index += 1

        logger.info(
            "Chunked document %s (%s): %d chunks",
            document.document_id,
            document.filename,
            len(chunks),
        )
        return chunks

    def _chunk_page(
        self,
        text: str,
        document_id: str,
        page_number: int,
        source: str,
        start_index: int,
    ) -> list[KnowledgeChunk]:
        """Chunk a single page's text."""
        segments = _split_text_into_segments(
            text=text,
            chunk_size=self._config.chunk_size,
            overlap=self._config.chunk_overlap,
            min_size=self._config.min_chunk_size,
        )

        chunks: list[KnowledgeChunk] = []
        for i, (start_char, end_char, segment_text) in enumerate(segments):
            idx = start_index + i
            chunk_id = _make_chunk_id(document_id, idx)
            section = _detect_section(segment_text)

            chunks.append(
                KnowledgeChunk(
                    chunk_id=chunk_id,
                    document_id=document_id,
                    text=segment_text,
                    page_number=page_number,
                    section=section,
                    source=source,
                    chunk_index=idx,
                    start_char=start_char,
                    end_char=end_char,
                    metadata={
                        "filename": "",  # Filled by caller
                    },
                )
            )

        return chunks
