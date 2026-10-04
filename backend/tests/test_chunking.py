"""Tests for app.knowledge.chunking."""

import pytest

from app.knowledge.chunking import ChunkingConfig, ChunkingService, _split_text_into_segments


class TestChunkingShortText:
    """A short text that fits in one chunk."""

    def test_short_text_produces_one_chunk(self):
        segments = _split_text_into_segments(
            text="Hello, world. This is a short paragraph.",
            chunk_size=800,
            overlap=100,
            min_size=10,
        )
        assert len(segments) == 1

    def test_short_text_content_preserved(self):
        text = "Hello, world. This is a short paragraph."
        segments = _split_text_into_segments(
            text=text, chunk_size=800, overlap=100, min_size=10,
        )
        assert segments[0][2].strip() == text.strip()


class TestChunkingLongText:
    """A longer text (2000+ chars) produces multiple chunks."""

    @pytest.fixture()
    def long_text(self):
        # Build a text > 2000 chars from distinct paragraphs
        paragraphs = [
            f"Paragraph {i}. " + ("Lorem ipsum dolor sit amet. " * 8)
            for i in range(15)
        ]
        return "\n\n".join(paragraphs)

    def test_multiple_chunks_produced(self, long_text):
        segments = _split_text_into_segments(
            text=long_text, chunk_size=400, overlap=50, min_size=30,
        )
        assert len(segments) > 1

    def test_chunks_have_overlap_content(self, long_text):
        """When overlap > 0, consecutive chunks should share some text."""
        segments = _split_text_into_segments(
            text=long_text, chunk_size=400, overlap=80, min_size=30,
        )
        if len(segments) >= 2:
            first_end = segments[0][2]
            second_start = segments[1][2]
            # The tail of the first chunk should appear in the second chunk
            overlap_tail = first_end[-40:]
            assert overlap_tail in second_start


class TestMinChunkSize:
    """Minimum chunk size enforcement."""

    def test_tiny_text_below_min_returns_empty(self):
        segments = _split_text_into_segments(
            text="Hi", chunk_size=800, overlap=100, min_size=50,
        )
        assert segments == []


class TestEmptyText:
    """Empty or whitespace-only text returns no segments."""

    def test_empty_string(self):
        segments = _split_text_into_segments(
            text="", chunk_size=800, overlap=100, min_size=10,
        )
        assert segments == []

    def test_whitespace_only(self):
        segments = _split_text_into_segments(
            text="   \n\n   ", chunk_size=800, overlap=100, min_size=10,
        )
        assert segments == []


class TestChunkingConfig:
    """ChunkingConfig validation."""

    def test_overlap_must_be_less_than_size(self):
        with pytest.raises(ValueError, match="chunk_overlap"):
            ChunkingConfig(chunk_size=100, chunk_overlap=100)
