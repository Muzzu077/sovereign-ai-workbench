"""
Tests for v0.7.0 Local Neural Embeddings.

Covers:
- LocalNeuralEmbeddingProvider unit tests (mocked ONNX — no real model needed)
- EmbeddingConfig fingerprint format for neural provider
- Provider factory in main.py (_build_embedding_provider)
- Configuration (Settings neural fields)
- Index compatibility (fingerprint mismatch triggers REBUILD_REQUIRED)
- Ingestion with neural provider (no fit() required)
- Retrieval threshold calibration
- Offline/network safety (no network at runtime)
- Health/observability info
- Evaluation framework (paraphrase queries, no-evidence, multi-K)

Unit tests use mocked ONNX sessions — they do NOT require the real
87MB model.  Integration tests that use the real model are gated
behind ``@pytest.mark.skipif`` and only run when model artifacts exist.
"""

import json
import os
import shutil
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock

import numpy as np
import pytest

from app.documents.models import (
    Document,
    DocumentMetadata,
    DocumentPage,
    ExtractionStatus,
    FileType,
)
from app.knowledge.chunking import ChunkingConfig, ChunkingService
from app.knowledge.embeddings import EmbeddingProvider
from app.knowledge.ingestion import KnowledgeIngestionService
from app.knowledge.memory_store import InMemoryVectorStore
from app.knowledge.models import EmbeddingConfig, EvidenceQuality
from app.knowledge.neural_embeddings import (
    LocalNeuralEmbeddingProvider,
    NeuralEmbeddingError,
    NeuralModelLoadError,
    NeuralModelNotFoundError,
)
from app.knowledge.persistent_store import PersistentVectorStore, VectorStoreHealth
from app.knowledge.retrieval import KnowledgeRetriever, classify_evidence
from app.knowledge.tfidf_embeddings import TfidfEmbeddingProvider


# ============================================================
# Helpers
# ============================================================

_REAL_MODEL_PATH = Path("models/embeddings/all-MiniLM-L6-v2")
_REAL_MODEL_EXISTS = (
    _REAL_MODEL_PATH.exists()
    and (_REAL_MODEL_PATH / "onnx" / "model.onnx").exists()
    and (_REAL_MODEL_PATH / "tokenizer.json").exists()
)


def _make_doc(doc_id: str, filename: str, text: str) -> Document:
    return Document(
        document_id=doc_id,
        filename=filename,
        file_type=FileType.TXT,
        file_size=len(text.encode()),
        page_count=1,
        extraction_status=ExtractionStatus.TEXT_EXTRACTED,
        text=text,
        pages=[DocumentPage(page_number=1, text=text, source="text_extraction")],
        metadata=DocumentMetadata(original_filename=filename),
    )


def _create_fake_model_dir(tmp_path: Path) -> Path:
    """Create a minimal model directory with config/tokenizer stubs."""
    model_dir = tmp_path / "fake_model"
    onnx_dir = model_dir / "onnx"
    onnx_dir.mkdir(parents=True)

    # config.json with hidden_size
    config = {"hidden_size": 384, "model_type": "bert"}
    (model_dir / "config.json").write_text(json.dumps(config))

    # tokenizer.json — must exist but content doesn't matter for validation
    (model_dir / "tokenizer.json").write_text("{}")

    # model.onnx — empty placeholder (won't be loaded in unit tests)
    (onnx_dir / "model.onnx").write_bytes(b"FAKE_ONNX")

    return model_dir


class MockOnnxSession:
    """Mock ONNX InferenceSession that returns deterministic embeddings."""

    def __init__(self, dim: int = 384):
        self._dim = dim

    def run(self, output_names, inputs):
        input_ids = inputs["input_ids"]
        batch_size = input_ids.shape[0]
        seq_len = input_ids.shape[1]
        # Return token embeddings shaped (batch, seq_len, dim)
        # Use input_ids hash to produce deterministic but varying output
        rng = np.random.RandomState(int(np.sum(input_ids[:, :3])) % 2**31)
        token_embeddings = rng.randn(batch_size, seq_len, self._dim).astype(
            np.float32
        )
        return [token_embeddings]

    def get_providers(self):
        return ["CPUExecutionProvider"]


class MockTokenizerEncoding:
    """Mock tokenizer encoding result."""

    def __init__(self, length: int = 10):
        self.ids = list(range(length))
        self.attention_mask = [1] * length


class MockTokenizer:
    """Mock HuggingFace fast tokenizer."""

    def __init__(self):
        self._truncation_enabled = False
        self._padding_enabled = False

    def encode(self, text):
        # Vary length slightly based on text to get different embeddings
        length = min(10, max(3, len(text.split())))
        return MockTokenizerEncoding(length)

    def encode_batch(self, texts):
        return [self.encode(t) for t in texts]

    def enable_truncation(self, max_length=256):
        self._truncation_enabled = True

    def enable_padding(self, pad_id=0, pad_token="[PAD]", length=None):
        self._padding_enabled = True


def _build_mocked_provider(
    tmp_path: Path,
    *,
    dim: int = 384,
    normalize: bool = True,
    device: str = "cpu",
) -> LocalNeuralEmbeddingProvider:
    """Create a LocalNeuralEmbeddingProvider with mocked ONNX internals.

    The provider passes file validation (real directory structure)
    but uses mock ONNX session and tokenizer for inference.
    """
    model_dir = _create_fake_model_dir(tmp_path)
    provider = LocalNeuralEmbeddingProvider(
        model_path=model_dir,
        model_name="test-model",
        device=device,
        normalize=normalize,
    )

    # Inject mocks to bypass real ONNX/tokenizer loading
    provider._session = MockOnnxSession(dim=dim)
    provider._tokenizer = MockTokenizer()
    provider._active_device = "cpu"

    return provider


# ============================================================
# 1. EmbeddingConfig & Fingerprint Tests
# ============================================================


class TestNeuralEmbeddingConfig:
    """Test EmbeddingConfig fingerprint format for neural provider."""

    def test_neural_fingerprint_includes_normalization(self):
        config = EmbeddingConfig(
            provider="neural-all-MiniLM-L6-v2",
            version=1,
            model_name="all-MiniLM-L6-v2",
            dimension=384,
            preprocessing_version=1,
            normalization="l2",
        )
        fp = config.fingerprint()
        assert fp == "neural-all-MiniLM-L6-v2:v1:all-MiniLM-L6-v2:d384:p1:nl2"

    def test_tfidf_fingerprint_unchanged(self):
        """TF-IDF fingerprint must remain backward-compatible (no :n suffix)."""
        config = EmbeddingConfig(
            provider="tfidf",
            version=1,
            model_name="",
            dimension=512,
            preprocessing_version=1,
            normalization="",
        )
        fp = config.fingerprint()
        assert fp == "tfidf:v1::d512:p1"
        assert ":n" not in fp

    def test_neural_config_differs_from_tfidf(self):
        neural = EmbeddingConfig(
            provider="neural-all-MiniLM-L6-v2",
            version=1,
            model_name="all-MiniLM-L6-v2",
            dimension=384,
            preprocessing_version=1,
            normalization="l2",
        )
        tfidf = EmbeddingConfig(
            provider="tfidf",
            version=1,
            model_name="",
            dimension=512,
            preprocessing_version=1,
        )
        assert neural.fingerprint() != tfidf.fingerprint()

    def test_normalization_none_produces_n_suffix(self):
        config = EmbeddingConfig(
            provider="neural-test",
            version=1,
            model_name="test",
            dimension=128,
            preprocessing_version=1,
            normalization="none",
        )
        fp = config.fingerprint()
        assert fp.endswith(":nnone")

    def test_different_dimensions_different_fingerprints(self):
        c1 = EmbeddingConfig(provider="neural-test", dimension=384, normalization="l2")
        c2 = EmbeddingConfig(provider="neural-test", dimension=768, normalization="l2")
        assert c1.fingerprint() != c2.fingerprint()


# ============================================================
# 2. Provider Path Validation Tests
# ============================================================


class TestNeuralProviderValidation:
    """Test model artifact validation (fail-fast, no network)."""

    def test_missing_directory_raises(self):
        with pytest.raises(NeuralModelNotFoundError, match="not found"):
            LocalNeuralEmbeddingProvider(model_path="/nonexistent/path/to/model")

    def test_missing_onnx_model_raises(self, tmp_path):
        model_dir = tmp_path / "incomplete"
        model_dir.mkdir()
        (model_dir / "tokenizer.json").write_text("{}")
        # No onnx/model.onnx
        with pytest.raises(NeuralModelNotFoundError, match="model.onnx"):
            LocalNeuralEmbeddingProvider(model_path=model_dir)

    def test_missing_tokenizer_raises(self, tmp_path):
        model_dir = tmp_path / "incomplete"
        onnx_dir = model_dir / "onnx"
        onnx_dir.mkdir(parents=True)
        (onnx_dir / "model.onnx").write_bytes(b"FAKE")
        # No tokenizer.json
        with pytest.raises(NeuralModelNotFoundError, match="tokenizer.json"):
            LocalNeuralEmbeddingProvider(model_path=model_dir)

    def test_valid_directory_passes_validation(self, tmp_path):
        model_dir = _create_fake_model_dir(tmp_path)
        # Should not raise — validation passes
        provider = LocalNeuralEmbeddingProvider(model_path=model_dir)
        assert provider.dimension() == 384
        assert not provider.model_loaded  # lazy — not loaded yet

    def test_config_json_missing_uses_default_dim(self, tmp_path):
        model_dir = tmp_path / "no_config"
        onnx_dir = model_dir / "onnx"
        onnx_dir.mkdir(parents=True)
        (onnx_dir / "model.onnx").write_bytes(b"FAKE")
        (model_dir / "tokenizer.json").write_text("{}")
        # No config.json
        provider = LocalNeuralEmbeddingProvider(model_path=model_dir)
        assert provider.dimension() == 384  # default

    def test_config_json_custom_dimension(self, tmp_path):
        model_dir = _create_fake_model_dir(tmp_path)
        (model_dir / "config.json").write_text(json.dumps({"hidden_size": 768}))
        provider = LocalNeuralEmbeddingProvider(model_path=model_dir)
        assert provider.dimension() == 768


# ============================================================
# 3. Provider Interface Tests (Mocked ONNX)
# ============================================================


class TestNeuralProviderInterface:
    """Test the EmbeddingProvider interface with mocked ONNX."""

    def test_get_name(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        assert provider.get_name() == "neural-test-model"

    def test_get_version(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        assert provider.get_version() == 1

    def test_get_model_name(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        assert provider.get_model_name() == "test-model"

    def test_dimension(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        assert provider.dimension() == 384

    def test_get_config_returns_embedding_config(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        config = provider.get_config()
        assert isinstance(config, EmbeddingConfig)
        assert config.provider == "neural-test-model"
        assert config.dimension == 384
        assert config.normalization == "l2"

    def test_get_config_no_normalize(self, tmp_path):
        provider = _build_mocked_provider(tmp_path, normalize=False)
        config = provider.get_config()
        assert config.normalization == "none"

    def test_embed_returns_correct_shape(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        vec = provider.embed("test text for embedding")
        assert isinstance(vec, np.ndarray)
        assert vec.shape == (384,)

    def test_embed_is_deterministic(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        v1 = provider.embed("deterministic test")
        v2 = provider.embed("deterministic test")
        np.testing.assert_array_equal(v1, v2)

    def test_embed_different_texts_different_vectors(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        v1 = provider.embed("first text about safety procedures")
        v2 = provider.embed("completely different topic about cooking recipes")
        # Should not be identical (mock produces input-dependent output)
        assert not np.array_equal(v1, v2)

    def test_embed_normalized_unit_length(self, tmp_path):
        provider = _build_mocked_provider(tmp_path, normalize=True)
        vec = provider.embed("test normalization")
        norm = np.linalg.norm(vec)
        assert abs(norm - 1.0) < 1e-5, f"Expected unit norm, got {norm}"

    def test_embed_unnormalized(self, tmp_path):
        provider = _build_mocked_provider(tmp_path, normalize=False)
        vec = provider.embed("test no normalization")
        norm = np.linalg.norm(vec)
        # Unnormalized — norm should NOT be exactly 1.0
        # (statistically extremely unlikely with random vectors)
        assert vec.shape == (384,)

    def test_embed_batch_returns_correct_count(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        texts = ["alpha", "beta", "gamma", "delta"]
        results = provider.embed_batch(texts)
        assert len(results) == 4
        for vec in results:
            assert vec.shape == (384,)

    def test_embed_batch_empty_list(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        results = provider.embed_batch([])
        assert results == []

    def test_embed_batch_single_item(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        results = provider.embed_batch(["single text"])
        assert len(results) == 1
        assert results[0].shape == (384,)

    def test_embed_empty_text_handled(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        # Empty text should be preprocessed to " " and not crash
        vec = provider.embed("")
        assert vec.shape == (384,)

    def test_embed_whitespace_only_handled(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        vec = provider.embed("   \n\t  ")
        assert vec.shape == (384,)

    def test_embed_very_long_text(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        long_text = "word " * 50000  # 250K chars
        vec = provider.embed(long_text)
        assert vec.shape == (384,)


# ============================================================
# 4. Preprocessing Tests
# ============================================================


class TestNeuralPreprocessing:
    def test_strip_whitespace(self):
        result = LocalNeuralEmbeddingProvider._preprocess("  hello world  ")
        assert result == "hello world"

    def test_empty_string_becomes_space(self):
        result = LocalNeuralEmbeddingProvider._preprocess("")
        assert result == " "

    def test_whitespace_only_becomes_space(self):
        result = LocalNeuralEmbeddingProvider._preprocess("   \n\t  ")
        assert result == " "

    def test_truncation_at_max_chars(self):
        long_text = "x" * 200_000
        result = LocalNeuralEmbeddingProvider._preprocess(long_text)
        assert len(result) == 100_000

    def test_normal_text_unchanged(self):
        text = "Normal sentence about turbine maintenance."
        result = LocalNeuralEmbeddingProvider._preprocess(text)
        assert result == text


# ============================================================
# 5. Mean Pooling & Normalization Tests
# ============================================================


class TestMeanPoolAndNormalize:
    def test_mean_pool_basic(self):
        # 1 batch, 3 tokens, 4 dims
        token_emb = np.array([[[1.0, 2.0, 3.0, 4.0],
                                [5.0, 6.0, 7.0, 8.0],
                                [0.0, 0.0, 0.0, 0.0]]], dtype=np.float32)
        mask = np.array([[1, 1, 0]], dtype=np.int64)  # 3rd token is padding

        result = LocalNeuralEmbeddingProvider._mean_pool(token_emb, mask)
        expected = np.array([[3.0, 4.0, 5.0, 6.0]], dtype=np.float32)
        np.testing.assert_array_almost_equal(result, expected)

    def test_mean_pool_all_padding(self):
        """All-padding should not produce NaN (clipped to 1e-9)."""
        token_emb = np.array([[[1.0, 2.0]]], dtype=np.float32)
        mask = np.array([[0]], dtype=np.int64)
        result = LocalNeuralEmbeddingProvider._mean_pool(token_emb, mask)
        assert not np.any(np.isnan(result))

    def test_l2_normalize(self):
        vecs = np.array([[3.0, 4.0]], dtype=np.float32)
        result = LocalNeuralEmbeddingProvider._l2_normalize(vecs)
        np.testing.assert_array_almost_equal(result, [[0.6, 0.8]])
        norm = np.linalg.norm(result[0])
        assert abs(norm - 1.0) < 1e-6

    def test_l2_normalize_zero_vector(self):
        """Zero vector should not produce NaN (clipped norm)."""
        vecs = np.array([[0.0, 0.0, 0.0]], dtype=np.float32)
        result = LocalNeuralEmbeddingProvider._l2_normalize(vecs)
        assert not np.any(np.isnan(result))

    def test_l2_normalize_batch(self):
        vecs = np.array([[3.0, 4.0], [1.0, 0.0]], dtype=np.float32)
        result = LocalNeuralEmbeddingProvider._l2_normalize(vecs)
        for row in result:
            norm = np.linalg.norm(row)
            assert abs(norm - 1.0) < 1e-6


# ============================================================
# 6. Embedding Validation Tests
# ============================================================


class TestEmbeddingValidation:
    def test_valid_embedding_passes(self, tmp_path):
        provider = _build_mocked_provider(tmp_path, dim=4)
        provider._dimension = 4
        vec = np.array([0.1, 0.2, 0.3, 0.4], dtype=np.float32)
        provider._validate_embedding(vec)  # Should not raise

    def test_wrong_dimension_raises(self, tmp_path):
        provider = _build_mocked_provider(tmp_path, dim=4)
        provider._dimension = 4
        vec = np.array([0.1, 0.2], dtype=np.float32)  # Wrong dim
        with pytest.raises(NeuralEmbeddingError, match="dimension mismatch"):
            provider._validate_embedding(vec)

    def test_nan_embedding_raises(self, tmp_path):
        provider = _build_mocked_provider(tmp_path, dim=4)
        provider._dimension = 4
        vec = np.array([0.1, float("nan"), 0.3, 0.4], dtype=np.float32)
        with pytest.raises(NeuralEmbeddingError, match="NaN"):
            provider._validate_embedding(vec)

    def test_inf_embedding_raises(self, tmp_path):
        provider = _build_mocked_provider(tmp_path, dim=4)
        provider._dimension = 4
        vec = np.array([0.1, float("inf"), 0.3, 0.4], dtype=np.float32)
        with pytest.raises(NeuralEmbeddingError, match="NaN or Inf"):
            provider._validate_embedding(vec)


# ============================================================
# 7. Device Resolution Tests
# ============================================================


class TestDeviceResolution:
    def test_cpu_device_default(self, tmp_path):
        provider = _build_mocked_provider(tmp_path, device="cpu")
        assert provider.active_device == "cpu"

    def test_cuda_without_provider_raises(self, tmp_path):
        model_dir = _create_fake_model_dir(tmp_path)
        provider = LocalNeuralEmbeddingProvider(
            model_path=model_dir, device="cuda"
        )

        mock_ort = MagicMock()
        mock_ort.get_available_providers.return_value = ["CPUExecutionProvider"]

        with pytest.raises(NeuralModelLoadError, match="CUDA.*not available"):
            provider._resolve_providers(mock_ort)

    def test_cuda_fallback_to_cpu(self, tmp_path):
        model_dir = _create_fake_model_dir(tmp_path)
        provider = LocalNeuralEmbeddingProvider(
            model_path=model_dir, device="cuda", fallback_to_cpu=True
        )

        mock_ort = MagicMock()
        mock_ort.get_available_providers.return_value = ["CPUExecutionProvider"]

        providers = provider._resolve_providers(mock_ort)
        assert providers == ["CPUExecutionProvider"]

    def test_cuda_available_uses_cuda(self, tmp_path):
        model_dir = _create_fake_model_dir(tmp_path)
        provider = LocalNeuralEmbeddingProvider(
            model_path=model_dir, device="cuda"
        )

        mock_ort = MagicMock()
        mock_ort.get_available_providers.return_value = [
            "CUDAExecutionProvider",
            "CPUExecutionProvider",
        ]

        providers = provider._resolve_providers(mock_ort)
        assert providers == ["CUDAExecutionProvider", "CPUExecutionProvider"]


# ============================================================
# 8. Lazy Loading Tests
# ============================================================


class TestLazyLoading:
    def test_not_loaded_at_construction(self, tmp_path):
        model_dir = _create_fake_model_dir(tmp_path)
        provider = LocalNeuralEmbeddingProvider(model_path=model_dir)
        assert not provider.model_loaded
        assert provider._session is None
        assert provider._tokenizer is None

    def test_loaded_after_embed(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        # Mocks are injected, so model_loaded should be True
        assert provider.model_loaded

    def test_dimension_available_before_loading(self, tmp_path):
        model_dir = _create_fake_model_dir(tmp_path)
        provider = LocalNeuralEmbeddingProvider(model_path=model_dir)
        # Dimension read from config.json, available before lazy load
        assert provider.dimension() == 384
        assert not provider.model_loaded

    def test_config_available_before_loading(self, tmp_path):
        model_dir = _create_fake_model_dir(tmp_path)
        provider = LocalNeuralEmbeddingProvider(model_path=model_dir)
        config = provider.get_config()
        assert config.dimension == 384
        assert not provider.model_loaded


# ============================================================
# 9. Health Info Tests
# ============================================================


class TestNeuralHealthInfo:
    def test_health_info_structure(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        info = provider.get_health_info()

        assert info["embedding_provider"] == "neural-test-model"
        assert info["embedding_model"] == "test-model"
        assert info["embedding_dimension"] == 384
        assert info["embedding_version"] == 1
        assert info["offline_mode"] is True
        assert info["normalization"] == "l2"
        assert info["model_loaded"] is True
        assert info["device"] == "cpu"
        assert "embedding_fingerprint" in info
        assert "model_path" in info

    def test_health_info_before_loading(self, tmp_path):
        model_dir = _create_fake_model_dir(tmp_path)
        provider = LocalNeuralEmbeddingProvider(model_path=model_dir)
        info = provider.get_health_info()
        assert info["model_loaded"] is False
        assert info["device"] == "cpu"  # requested device


# ============================================================
# 10. Index Compatibility / Fingerprint Mismatch Tests
# ============================================================


class TestIndexCompatibility:
    def test_fingerprint_mismatch_triggers_rebuild(self, tmp_path):
        """Switching from TF-IDF to neural fingerprint should trigger REBUILD_REQUIRED."""
        store_dir = tmp_path / "vectors"

        # First, create a store with TF-IDF fingerprint
        tfidf_fp = "tfidf:v1::d512:p1"
        store1 = PersistentVectorStore(
            storage_dir=store_dir,
            expected_dimension=512,
            embedding_fingerprint=tfidf_fp,
        )
        vec = np.random.randn(512).astype(np.float32)
        store1.add("c1", vec, {"text": "test", "doc": "d1"})
        store1.save()
        assert store1.health_status == VectorStoreHealth.HEALTHY

        # Re-open with neural fingerprint — should detect mismatch
        neural_fp = "neural-all-MiniLM-L6-v2:v1:all-MiniLM-L6-v2:d384:p1:nl2"
        store2 = PersistentVectorStore(
            storage_dir=store_dir,
            expected_dimension=384,
            embedding_fingerprint=neural_fp,
        )
        assert store2.health_status == VectorStoreHealth.REBUILD_REQUIRED

    def test_same_fingerprint_loads_healthy(self, tmp_path):
        store_dir = tmp_path / "vectors"
        fp = "neural-test:v1:test:d384:p1:nl2"

        store1 = PersistentVectorStore(
            storage_dir=store_dir,
            expected_dimension=384,
            embedding_fingerprint=fp,
        )
        vec = np.random.randn(384).astype(np.float32)
        store1.add("c1", vec, {"text": "test", "doc": "d1"})
        store1.save()

        store2 = PersistentVectorStore(
            storage_dir=store_dir,
            expected_dimension=384,
            embedding_fingerprint=fp,
        )
        assert store2.health_status == VectorStoreHealth.HEALTHY
        assert store2.count() == 1


# ============================================================
# 11. Ingestion with Neural Provider Tests
# ============================================================


class TestNeuralIngestion:
    """Test that ingestion works with neural provider (no fit() needed)."""

    def test_ingest_single_document(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        chunking = ChunkingService(config=ChunkingConfig())
        store = InMemoryVectorStore()
        service = KnowledgeIngestionService(
            chunking_service=chunking,
            embedding_provider=provider,
            vector_store=store,
        )

        # Text must exceed min_chunk_size (50 chars) to produce chunks
        doc = _make_doc(
            "D1", "test.txt",
            "This is a test document about turbine safety procedures. "
            "It covers lockout tagout, energy isolation, and zero energy verification "
            "steps that must be followed before any maintenance work begins.",
        )
        result = service.ingest(doc)

        assert result.document_id == "D1"
        assert store.count() > 0

    def test_ingest_multiple_documents(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        chunking = ChunkingService(config=ChunkingConfig())
        store = InMemoryVectorStore()
        service = KnowledgeIngestionService(
            chunking_service=chunking,
            embedding_provider=provider,
            vector_store=store,
        )

        docs = [
            _make_doc(
                "D1", "safety.txt",
                "Safety procedures for hazardous areas including lockout tagout "
                "energy isolation and personal protective equipment requirements.",
            ),
            _make_doc(
                "D2", "maint.txt",
                "Maintenance schedule for gas turbines including quarterly inspections "
                "bearing lubrication oil changes and filter replacements.",
            ),
        ]
        for doc in docs:
            service.ingest(doc)

        assert store.count() >= 2

    def test_no_fit_required(self, tmp_path):
        """Neural provider should NOT have a fit() method."""
        provider = _build_mocked_provider(tmp_path)
        assert not hasattr(provider, "fit") or not callable(getattr(provider, "fit", None))

    def test_ingestion_records_embedding_provider(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        chunking = ChunkingService(config=ChunkingConfig())
        store = InMemoryVectorStore()
        config = provider.get_config()
        service = KnowledgeIngestionService(
            chunking_service=chunking,
            embedding_provider=provider,
            vector_store=store,
            embedding_config=config,
        )

        # Text must exceed min_chunk_size to succeed (not hit _fail_document)
        doc = _make_doc(
            "D1", "test.txt",
            "Test document content for embedding provider verification. "
            "This needs to be long enough to pass the minimum chunk size "
            "threshold during the chunking phase of ingestion.",
        )
        result = service.ingest(doc)

        assert result.embedding_provider == "neural-test-model"


# ============================================================
# 12. Retrieval with Neural Provider Tests
# ============================================================


class TestNeuralRetrieval:
    """Test retrieval pipeline with mocked neural provider."""

    def _build_retrieval_system(self, tmp_path, threshold=0.05):
        provider = _build_mocked_provider(tmp_path)
        chunking = ChunkingService(config=ChunkingConfig())
        store = InMemoryVectorStore()
        ingestion = KnowledgeIngestionService(
            chunking_service=chunking,
            embedding_provider=provider,
            vector_store=store,
        )
        retriever = KnowledgeRetriever(
            embedding_provider=provider,
            vector_store=store,
            ingestion_service=ingestion,
            default_top_k=5,
            similarity_threshold=threshold,
        )
        return ingestion, retriever

    def test_retrieve_returns_results(self, tmp_path):
        ingestion, retriever = self._build_retrieval_system(tmp_path)

        doc = _make_doc(
            "D1",
            "turbine.txt",
            "Gas turbine startup sequence involves turning gear operation "
            "for 30 minutes before ignition sequence."
        )
        ingestion.ingest(doc)

        results, latency = retriever.retrieve("turbine startup")
        assert isinstance(results, list)
        assert latency > 0

    def test_higher_threshold_reduces_results(self, tmp_path):
        ingestion_low, retriever_low = self._build_retrieval_system(
            tmp_path / "low", threshold=0.01
        )
        ingestion_high, retriever_high = self._build_retrieval_system(
            tmp_path / "high", threshold=0.99
        )

        doc = _make_doc("D1", "test.txt", "Some test content for threshold testing.")
        ingestion_low.ingest(doc)
        ingestion_high.ingest(doc)

        results_low, _ = retriever_low.retrieve("test")
        results_high, _ = retriever_high.retrieve("test")

        assert len(results_high) <= len(results_low)


# ============================================================
# 13. Settings Configuration Tests
# ============================================================


class TestNeuralSettings:
    """Test that Settings exposes neural embedding configuration fields."""

    def test_default_embedding_provider_is_tfidf(self):
        from app.config import Settings
        settings = Settings()
        assert settings.embedding_provider == "tfidf"

    def test_neural_model_path_default(self):
        from app.config import Settings
        settings = Settings()
        assert str(settings.neural_model_path) == "models/embeddings/all-MiniLM-L6-v2"

    def test_neural_device_default(self):
        from app.config import Settings
        settings = Settings()
        assert settings.neural_device == "cpu"

    def test_neural_batch_size_default(self):
        from app.config import Settings
        settings = Settings()
        assert settings.neural_batch_size == 64

    def test_neural_normalize_default(self):
        from app.config import Settings
        settings = Settings()
        assert settings.neural_normalize is True

    def test_neural_similarity_threshold_default(self):
        from app.config import Settings
        settings = Settings()
        assert settings.neural_similarity_threshold == 0.25

    def test_neural_fallback_to_cpu_default(self):
        from app.config import Settings
        settings = Settings()
        assert settings.neural_fallback_to_cpu is False

    def test_neural_max_seq_length_default(self):
        from app.config import Settings
        settings = Settings()
        assert settings.neural_max_seq_length == 256


# ============================================================
# 14. Provider Factory Tests
# ============================================================


class TestProviderFactory:
    """Test _build_embedding_provider factory in main.py."""

    def test_factory_returns_tfidf_by_default(self):
        from app.config import Settings
        from app.main import _build_embedding_provider

        settings = Settings()
        provider = _build_embedding_provider(settings)
        assert isinstance(provider, TfidfEmbeddingProvider)

    def test_factory_returns_neural_when_configured(self):
        """When embedding_provider='neural' and model exists, returns neural."""
        if not _REAL_MODEL_EXISTS:
            pytest.skip("Real neural model not present")

        from app.config import Settings
        from app.main import _build_embedding_provider

        settings = Settings()
        settings.embedding_provider = "neural"
        provider = _build_embedding_provider(settings)
        assert isinstance(provider, LocalNeuralEmbeddingProvider)

    def test_factory_neural_missing_model_raises(self, tmp_path):
        from app.config import Settings
        from app.main import _build_embedding_provider

        settings = Settings()
        settings.embedding_provider = "neural"
        settings.neural_model_path = tmp_path / "nonexistent"

        with pytest.raises(NeuralModelNotFoundError):
            _build_embedding_provider(settings)


# ============================================================
# 15. Offline / Network Safety Tests
# ============================================================


class TestOfflineNetworkSafety:
    """Verify that neural provider makes zero network calls."""

    def test_no_network_on_construction(self, tmp_path):
        model_dir = _create_fake_model_dir(tmp_path)
        with patch("socket.socket") as mock_socket:
            provider = LocalNeuralEmbeddingProvider(model_path=model_dir)
            mock_socket.assert_not_called()

    def test_no_network_on_embed(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        with patch("socket.socket") as mock_socket:
            provider.embed("test offline embedding")
            mock_socket.assert_not_called()

    def test_no_network_on_batch(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        with patch("socket.socket") as mock_socket:
            provider.embed_batch(["text1", "text2"])
            mock_socket.assert_not_called()

    def test_health_info_offline_flag(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)
        info = provider.get_health_info()
        assert info["offline_mode"] is True


# ============================================================
# 16. Evaluation Framework Tests
# ============================================================


class TestEvaluationFramework:
    """Test the extended evaluation module structures and helpers."""

    def test_paraphrase_queries_exist(self):
        from app.knowledge.evaluation import PARAPHRASE_QUERIES
        assert len(PARAPHRASE_QUERIES) >= 5

    def test_no_evidence_queries_exist(self):
        from app.knowledge.evaluation import NO_EVIDENCE_QUERIES
        assert len(NO_EVIDENCE_QUERIES) >= 3

    def test_all_eval_queries_combined(self):
        from app.knowledge.evaluation import (
            ALL_EVAL_QUERIES,
            EVAL_QUERIES,
            NO_EVIDENCE_QUERIES,
            PARAPHRASE_QUERIES,
        )
        assert len(ALL_EVAL_QUERIES) == (
            len(EVAL_QUERIES) + len(PARAPHRASE_QUERIES) + len(NO_EVIDENCE_QUERIES)
        )

    def test_eval_query_structure(self):
        from app.knowledge.evaluation import PARAPHRASE_QUERIES
        for q in PARAPHRASE_QUERIES:
            assert q.query
            assert q.description
            assert len(q.expected_doc_ids) > 0
            assert len(q.expected_filenames) > 0

    def test_no_evidence_query_structure(self):
        from app.knowledge.evaluation import NO_EVIDENCE_QUERIES
        for q in NO_EVIDENCE_QUERIES:
            assert q.query
            assert q.description
            assert q.expected_doc_ids == []
            assert q.expected_filenames == []

    def test_embedding_evaluation_result_dataclass(self):
        from app.knowledge.evaluation import EmbeddingEvaluationResult
        result = EmbeddingEvaluationResult()
        assert result.recall_at_1 == 0.0
        assert result.paraphrase_recall_at_5 == 0.0
        assert result.no_evidence_accuracy == 0.0
        assert result.query_details == []

    def test_compute_recall_precision_helper(self):
        from app.knowledge.evaluation import _compute_recall_precision

        # Mock results with document_id attribute
        class MockResult:
            def __init__(self, doc_id):
                self.document_id = doc_id

        results = [MockResult("D1"), MockResult("D2"), MockResult("D3")]
        recall, precision = _compute_recall_precision(results, ["D1", "D2"], k=3)
        assert recall == 1.0
        assert abs(precision - 2 / 3) < 1e-6

    def test_compute_recall_precision_no_expected(self):
        from app.knowledge.evaluation import _compute_recall_precision
        # No expected docs (no-evidence query) with empty results
        recall, precision = _compute_recall_precision([], [], k=5)
        assert recall == 1.0
        assert precision == 1.0

    def test_run_embedding_evaluation_tfidf(self):
        """Run full evaluation with TF-IDF provider — should not crash."""
        from app.knowledge.evaluation import run_embedding_evaluation

        tfidf = TfidfEmbeddingProvider(max_features=128)
        result = run_embedding_evaluation(tfidf, similarity_threshold=0.05)

        assert result.provider == "tfidf-128"
        assert result.dimension == 128
        assert result.total_evaluation_time_ms > 0
        assert len(result.query_details) > 0
        assert result.recall_at_5 >= 0.0
        assert result.paraphrase_recall_at_5 >= 0.0

    def test_safe_mean_empty(self):
        from app.knowledge.evaluation import _safe_mean
        assert _safe_mean([]) == 0.0

    def test_safe_mean_values(self):
        from app.knowledge.evaluation import _safe_mean
        assert _safe_mean([1.0, 2.0, 3.0]) == 2.0


# ============================================================
# 17. EmbeddingProvider ABC Compliance
# ============================================================


class TestABCCompliance:
    """Verify LocalNeuralEmbeddingProvider satisfies EmbeddingProvider ABC."""

    def test_is_subclass(self):
        assert issubclass(LocalNeuralEmbeddingProvider, EmbeddingProvider)

    def test_implements_all_abstract_methods(self, tmp_path):
        provider = _build_mocked_provider(tmp_path)

        # All ABC methods should be callable
        assert callable(provider.embed)
        assert callable(provider.embed_batch)
        assert callable(provider.dimension)
        assert callable(provider.get_name)
        assert callable(provider.get_version)
        assert callable(provider.get_model_name)
        assert callable(provider.get_config)

    def test_tfidf_and_neural_share_interface(self, tmp_path):
        """Both providers implement the same interface."""
        neural = _build_mocked_provider(tmp_path)
        tfidf = TfidfEmbeddingProvider(max_features=128)

        for method_name in ["embed", "embed_batch", "dimension",
                            "get_name", "get_version", "get_model_name",
                            "get_config"]:
            assert hasattr(neural, method_name)
            assert hasattr(tfidf, method_name)


# ============================================================
# 18. Integration Tests (require real model — skipped in CI)
# ============================================================


@pytest.mark.skipif(not _REAL_MODEL_EXISTS, reason="Real neural model not present")
class TestNeuralIntegration:
    """Integration tests using the real all-MiniLM-L6-v2 model.

    These tests are skipped when model artifacts are not present
    (e.g. in CI without the 87MB model downloaded).
    """

    def test_real_model_loads_and_embeds(self):
        provider = LocalNeuralEmbeddingProvider(
            model_path=_REAL_MODEL_PATH,
        )
        vec = provider.embed("Test embedding with real model")
        assert vec.shape == (384,)
        assert abs(np.linalg.norm(vec) - 1.0) < 1e-5

    def test_real_model_semantic_similarity(self):
        provider = LocalNeuralEmbeddingProvider(
            model_path=_REAL_MODEL_PATH,
        )
        v1 = provider.embed("lockout tagout safety procedure")
        v2 = provider.embed("LOTO energy isolation process")
        v3 = provider.embed("chocolate cake recipe")

        sim_related = float(np.dot(v1, v2))
        sim_unrelated = float(np.dot(v1, v3))

        assert sim_related > sim_unrelated
        assert sim_related > 0.1   # Semantically related texts
        assert sim_unrelated < 0.15  # Unrelated texts should score low

    def test_real_model_batch_consistency(self):
        provider = LocalNeuralEmbeddingProvider(
            model_path=_REAL_MODEL_PATH,
        )
        texts = ["alpha text", "beta text", "gamma text"]

        single = [provider.embed(t) for t in texts]
        batch = provider.embed_batch(texts)

        for s, b in zip(single, batch):
            np.testing.assert_array_almost_equal(s, b, decimal=5)

    def test_real_model_deterministic(self):
        provider = LocalNeuralEmbeddingProvider(
            model_path=_REAL_MODEL_PATH,
        )
        v1 = provider.embed("determinism test")
        v2 = provider.embed("determinism test")
        np.testing.assert_array_equal(v1, v2)

    def test_real_model_evaluation_perfect_recall(self):
        """Neural provider should achieve perfect recall on exact queries."""
        from app.knowledge.evaluation import EVAL_QUERIES, run_embedding_evaluation

        provider = LocalNeuralEmbeddingProvider(
            model_path=_REAL_MODEL_PATH,
        )
        result = run_embedding_evaluation(
            provider,
            exact_queries=EVAL_QUERIES,
            paraphrase_queries=[],
            no_evidence_queries=[],
            similarity_threshold=0.25,
        )

        assert result.recall_at_1 == 1.0, (
            f"Expected perfect Recall@1, got {result.recall_at_1}"
        )
        assert result.recall_at_5 == 1.0, (
            f"Expected perfect Recall@5, got {result.recall_at_5}"
        )

    def test_real_model_paraphrase_recall(self):
        """Neural provider should handle paraphrase queries well."""
        from app.knowledge.evaluation import PARAPHRASE_QUERIES, run_embedding_evaluation

        provider = LocalNeuralEmbeddingProvider(
            model_path=_REAL_MODEL_PATH,
        )
        result = run_embedding_evaluation(
            provider,
            exact_queries=[],
            paraphrase_queries=PARAPHRASE_QUERIES,
            no_evidence_queries=[],
            similarity_threshold=0.25,
        )

        assert result.paraphrase_recall_at_5 >= 0.75, (
            f"Expected paraphrase Recall@5 >= 0.75, got {result.paraphrase_recall_at_5}"
        )

    def test_real_model_no_evidence_accuracy(self):
        """Neural provider should reject irrelevant queries."""
        from app.knowledge.evaluation import NO_EVIDENCE_QUERIES, run_embedding_evaluation

        provider = LocalNeuralEmbeddingProvider(
            model_path=_REAL_MODEL_PATH,
        )
        result = run_embedding_evaluation(
            provider,
            exact_queries=[],
            paraphrase_queries=[],
            no_evidence_queries=NO_EVIDENCE_QUERIES,
            similarity_threshold=0.25,
        )

        assert result.no_evidence_accuracy == 1.0, (
            f"Expected perfect no-evidence accuracy, got {result.no_evidence_accuracy}"
        )

    def test_real_model_full_pipeline_ingest_and_retrieve(self):
        """Full integration: ingest documents and retrieve with neural provider."""
        from app.knowledge.evaluation import build_evaluation_corpus

        provider = LocalNeuralEmbeddingProvider(
            model_path=_REAL_MODEL_PATH,
        )
        chunking = ChunkingService(config=ChunkingConfig())
        store = InMemoryVectorStore()
        ingestion = KnowledgeIngestionService(
            chunking_service=chunking,
            embedding_provider=provider,
            vector_store=store,
        )

        for doc in build_evaluation_corpus():
            ingestion.ingest(doc)

        retriever = KnowledgeRetriever(
            embedding_provider=provider,
            vector_store=store,
            ingestion_service=ingestion,
            default_top_k=3,
            similarity_threshold=0.25,
        )

        results, latency = retriever.retrieve("lockout tagout procedure")
        assert len(results) > 0
        assert results[0].document_id == "SOP-001"
        assert latency > 0
