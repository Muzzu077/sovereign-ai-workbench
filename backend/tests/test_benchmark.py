"""Tests for the benchmark infrastructure."""

from app.services.benchmark import BenchmarkRunner, BENCHMARK_CORPUS
from app.knowledge.chunking import ChunkingConfig, ChunkingService
from app.knowledge.tfidf_embeddings import TfidfEmbeddingProvider


class TestBenchmarkRunner:
    """Tests for the BenchmarkRunner."""

    def _make_runner(self) -> BenchmarkRunner:
        config = ChunkingConfig(chunk_size=500, chunk_overlap=50, min_chunk_size=30)
        chunking = ChunkingService(config=config)
        embedding = TfidfEmbeddingProvider(max_features=128)
        return BenchmarkRunner(
            chunking_service=chunking,
            embedding_provider=embedding,
        )

    def test_run_all_returns_system_profile(self):
        runner = self._make_runner()
        profile = runner.run_all()
        assert profile.timestamp
        assert profile.total_benchmark_ms > 0

    def test_chunking_benchmark_produces_chunks(self):
        runner = self._make_runner()
        profile = runner.run_all()
        assert profile.chunking.corpus_chars > 0
        assert profile.chunking.chunks_produced > 0
        assert profile.chunking.chars_per_second > 0

    def test_embedding_benchmark_measures_latency(self):
        runner = self._make_runner()
        profile = runner.run_all()
        assert profile.embedding.sample_count == 10
        assert profile.embedding.total_ms > 0
        assert profile.embedding.avg_ms_per_embed > 0
        assert profile.embedding.embeds_per_second > 0

    def test_embedding_provider_name(self):
        runner = self._make_runner()
        profile = runner.run_all()
        assert profile.embedding.provider.startswith("tfidf")

    def test_benchmark_corpus_is_nontrivial(self):
        assert len(BENCHMARK_CORPUS) > 5000
        assert "lockout" in BENCHMARK_CORPUS.lower()


class TestBenchmarkEndpoint:
    """Test the /benchmark API endpoint via TestClient."""

    def test_benchmark_returns_200(self):
        from fastapi.testclient import TestClient
        from app.main import create_app

        app = create_app()
        client = TestClient(app)
        resp = client.post("/benchmark")
        assert resp.status_code == 200
        data = resp.json()
        assert "chunking" in data
        assert "embedding" in data
        assert data["total_benchmark_ms"] > 0
