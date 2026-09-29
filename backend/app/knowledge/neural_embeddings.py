"""
Local neural embedding provider using ONNX Runtime.

Provides semantic embeddings via a local ONNX model (default:
all-MiniLM-L6-v2, 384-dimensional).  Runs entirely offline using
model artifacts stored on the local filesystem.

Design:
- Loads an ONNX model and HuggingFace fast tokenizer from a local
  directory — no network access at any point.
- Supports CPU and CUDA execution via ONNX Runtime providers.
- Mean-pooling + L2 normalization produces unit-length embeddings
  suitable for cosine similarity search.
- Lazy model loading: the ONNX session and tokenizer are created on
  first use, not at provider instantiation.
- Batch embedding with configurable batch size for memory safety.
- Deterministic: ONNX inference mode, no dropout, no augmentation.

Numerical determinism note:
  ONNX Runtime produces identical outputs for identical inputs on
  the *same* hardware and provider.  Cross-hardware bit-for-bit
  reproducibility is not guaranteed due to floating-point ordering
  differences in SIMD/CUDA kernels.

No cloud APIs.  No runtime downloads.  Fully sovereign.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

import numpy as np

from app.knowledge.embeddings import EmbeddingProvider
from app.knowledge.models import EmbeddingConfig

logger = logging.getLogger(__name__)

_NEURAL_VERSION = 1
_PREPROCESSING_VERSION = 1
_DEFAULT_MODEL_NAME = "all-MiniLM-L6-v2"
_DEFAULT_MODEL_DIM = 384
_DEFAULT_MAX_SEQ_LENGTH = 256
_DEFAULT_BATCH_SIZE = 64
_MAX_TEXT_CHARS = 100_000  # Safety limit per text


class NeuralModelNotFoundError(Exception):
    """Raised when the local neural model artifacts are missing."""


class NeuralModelLoadError(Exception):
    """Raised when the ONNX model fails to load."""


class NeuralEmbeddingError(Exception):
    """Raised when embedding inference produces invalid output."""


class LocalNeuralEmbeddingProvider(EmbeddingProvider):
    """ONNX-based local neural embedding provider.

    Loads a sentence-transformer model from a local directory
    containing:
      - onnx/model.onnx   (the ONNX graph)
      - tokenizer.json    (HuggingFace fast tokenizer)
      - config.json       (model config with hidden_size)

    Args:
        model_path: Filesystem path to the model directory.
        model_name: Human-readable name for fingerprinting.
        device: ``"cpu"`` or ``"cuda"``.  If ``"cuda"`` is requested
                but unavailable, raises ``NeuralModelLoadError``
                unless ``fallback_to_cpu=True``.
        fallback_to_cpu: If True and CUDA is unavailable, silently
                         fall back to CPU.  Default False.
        max_seq_length: Maximum token sequence length (truncation).
        batch_size: Maximum texts per inference batch.
        normalize: If True (default), L2-normalize embeddings.
        provider_version: Version number for fingerprint tracking.
    """

    def __init__(
        self,
        model_path: str | Path,
        *,
        model_name: str = _DEFAULT_MODEL_NAME,
        device: str = "cpu",
        fallback_to_cpu: bool = False,
        max_seq_length: int = _DEFAULT_MAX_SEQ_LENGTH,
        batch_size: int = _DEFAULT_BATCH_SIZE,
        normalize: bool = True,
        provider_version: int = _NEURAL_VERSION,
    ) -> None:
        self._model_path = Path(model_path)
        self._model_name = model_name
        self._requested_device = device.lower()
        self._fallback_to_cpu = fallback_to_cpu
        self._max_seq_length = max_seq_length
        self._batch_size = max(1, batch_size)
        self._normalize = normalize
        self._provider_version = provider_version

        # Resolved at load time
        self._active_device: str = ""
        self._dimension: int = 0

        # Lazy-loaded
        self._session: Any = None  # ort.InferenceSession
        self._tokenizer: Any = None  # tokenizers.Tokenizer

        # Validate that model artifacts exist (fail-fast, no network)
        self._validate_model_path()

        # Read dimension from config.json
        self._read_model_config()

    def _validate_model_path(self) -> None:
        """Verify required model files exist locally."""
        if not self._model_path.exists():
            raise NeuralModelNotFoundError(
                f"Neural embedding model directory not found: "
                f"{self._model_path}.  "
                f"Download the model artifacts and place them at this path.  "
                f"The provider does NOT download models at runtime."
            )
        required_files = [
            Path("onnx") / "model.onnx",
            Path("tokenizer.json"),
        ]
        for rel in required_files:
            full = self._model_path / rel
            if not full.exists():
                raise NeuralModelNotFoundError(
                    f"Required model file missing: {full}.  "
                    f"The model directory must contain: "
                    f"onnx/model.onnx, tokenizer.json"
                )

    def _read_model_config(self) -> None:
        """Read hidden_size from config.json to know dimension before loading."""
        config_path = self._model_path / "config.json"
        if config_path.exists():
            try:
                with open(config_path, encoding="utf-8") as f:
                    cfg = json.load(f)
                self._dimension = int(cfg.get("hidden_size", _DEFAULT_MODEL_DIM))
            except (json.JSONDecodeError, OSError, ValueError):
                self._dimension = _DEFAULT_MODEL_DIM
        else:
            self._dimension = _DEFAULT_MODEL_DIM

    def _ensure_loaded(self) -> None:
        """Lazy-load the ONNX session and tokenizer on first use."""
        if self._session is not None:
            return

        try:
            import onnxruntime as ort
        except ImportError as exc:
            raise NeuralModelLoadError(
                "onnxruntime is not installed.  "
                "Install with: pip install onnxruntime"
            ) from exc

        try:
            from tokenizers import Tokenizer
        except ImportError as exc:
            raise NeuralModelLoadError(
                "tokenizers is not installed.  "
                "Install with: pip install tokenizers"
            ) from exc

        # Determine execution providers
        providers = self._resolve_providers(ort)

        # Load ONNX session
        onnx_path = str(self._model_path / "onnx" / "model.onnx")
        load_start = time.monotonic()
        try:
            self._session = ort.InferenceSession(onnx_path, providers=providers)
        except Exception as exc:
            raise NeuralModelLoadError(
                f"Failed to load ONNX model from {onnx_path}: {exc}"
            ) from exc

        # Determine actual provider used
        actual_providers = self._session.get_providers()
        if "CUDAExecutionProvider" in actual_providers:
            self._active_device = "cuda"
        else:
            self._active_device = "cpu"

        # Load tokenizer (fully offline — from_file, not from_pretrained)
        tok_path = str(self._model_path / "tokenizer.json")
        try:
            self._tokenizer = Tokenizer.from_file(tok_path)
        except Exception as exc:
            self._session = None
            raise NeuralModelLoadError(
                f"Failed to load tokenizer from {tok_path}: {exc}"
            ) from exc

        self._tokenizer.enable_truncation(max_length=self._max_seq_length)
        self._tokenizer.enable_padding(
            pad_id=0,
            pad_token="[PAD]",
            length=None,  # dynamic padding per batch
        )

        load_time = (time.monotonic() - load_start) * 1000
        logger.info(
            "Neural embedding model loaded: %s (%s, %d-dim, %.0fms)",
            self._model_name,
            self._active_device,
            self._dimension,
            load_time,
        )

    def _resolve_providers(self, ort: Any) -> list[str]:
        """Resolve ONNX Runtime execution providers based on device config."""
        available = ort.get_available_providers()

        if self._requested_device == "cuda":
            if "CUDAExecutionProvider" in available:
                return ["CUDAExecutionProvider", "CPUExecutionProvider"]
            if self._fallback_to_cpu:
                logger.warning(
                    "CUDA requested but CUDAExecutionProvider not available.  "
                    "Falling back to CPU."
                )
                return ["CPUExecutionProvider"]
            raise NeuralModelLoadError(
                "CUDA requested but CUDAExecutionProvider is not available.  "
                f"Available providers: {available}.  "
                "Install onnxruntime-gpu for CUDA support, or set device='cpu'."
            )

        return ["CPUExecutionProvider"]

    @property
    def model_loaded(self) -> bool:
        """Whether the ONNX model is currently loaded in memory."""
        return self._session is not None

    @property
    def active_device(self) -> str:
        """Return the active inference device ('cpu' or 'cuda')."""
        if not self.model_loaded:
            return self._requested_device
        return self._active_device

    # ---- EmbeddingProvider interface ----

    def embed(self, text: str) -> np.ndarray:
        """Embed a single text into a 1-D vector.

        Validates output dimension and rejects NaN/Inf values.
        """
        self._ensure_loaded()
        text = self._preprocess(text)

        encoding = self._tokenizer.encode(text)
        input_ids = np.array([encoding.ids], dtype=np.int64)
        attention_mask = np.array([encoding.attention_mask], dtype=np.int64)
        token_type_ids = np.zeros_like(input_ids, dtype=np.int64)

        outputs = self._session.run(
            None,
            {
                "input_ids": input_ids,
                "attention_mask": attention_mask,
                "token_type_ids": token_type_ids,
            },
        )

        embedding = self._mean_pool(outputs[0], attention_mask)
        if self._normalize:
            embedding = self._l2_normalize(embedding)

        vec = embedding[0]
        self._validate_embedding(vec)
        return vec

    def embed_batch(self, texts: list[str]) -> list[np.ndarray]:
        """Embed a batch of texts efficiently.

        Processes texts in sub-batches of ``batch_size`` to limit
        memory usage.  Returns one embedding per input text.
        """
        if not texts:
            return []

        self._ensure_loaded()
        preprocessed = [self._preprocess(t) for t in texts]
        all_embeddings: list[np.ndarray] = []

        for i in range(0, len(preprocessed), self._batch_size):
            batch = preprocessed[i : i + self._batch_size]
            encodings = self._tokenizer.encode_batch(batch)

            input_ids = np.array([e.ids for e in encodings], dtype=np.int64)
            attention_mask = np.array(
                [e.attention_mask for e in encodings], dtype=np.int64,
            )
            token_type_ids = np.zeros_like(input_ids, dtype=np.int64)

            outputs = self._session.run(
                None,
                {
                    "input_ids": input_ids,
                    "attention_mask": attention_mask,
                    "token_type_ids": token_type_ids,
                },
            )

            embeddings = self._mean_pool(outputs[0], attention_mask)
            if self._normalize:
                embeddings = self._l2_normalize(embeddings)

            for vec in embeddings:
                self._validate_embedding(vec)
                all_embeddings.append(vec)

        return all_embeddings

    def dimension(self) -> int:
        """Return the embedding dimensionality (e.g. 384)."""
        return self._dimension

    def get_name(self) -> str:
        return f"neural-{self._model_name}"

    def get_version(self) -> int:
        return self._provider_version

    def get_model_name(self) -> str:
        return self._model_name

    def get_config(self) -> EmbeddingConfig:
        """Build an EmbeddingConfig describing this provider's settings."""
        return EmbeddingConfig(
            provider=self.get_name(),
            version=self.get_version(),
            model_name=self.get_model_name(),
            dimension=self.dimension(),
            preprocessing_version=_PREPROCESSING_VERSION,
            normalization="l2" if self._normalize else "none",
        )

    # ---- Internal ----

    @staticmethod
    def _preprocess(text: str) -> str:
        """Clean and truncate input text.

        Strips leading/trailing whitespace and truncates excessively
        long texts to prevent tokenizer/memory issues.  Empty text
        is replaced with a single space to avoid tokenizer errors.
        """
        text = text.strip()
        if not text:
            text = " "
        if len(text) > _MAX_TEXT_CHARS:
            text = text[:_MAX_TEXT_CHARS]
        return text

    @staticmethod
    def _mean_pool(
        token_embeddings: np.ndarray, attention_mask: np.ndarray,
    ) -> np.ndarray:
        """Mean-pool token embeddings using the attention mask.

        Args:
            token_embeddings: (batch, seq_len, hidden_dim) from ONNX.
            attention_mask: (batch, seq_len) binary mask.

        Returns:
            (batch, hidden_dim) mean-pooled embeddings.
        """
        mask_expanded = attention_mask[:, :, np.newaxis].astype(np.float32)
        sum_embeddings = np.sum(
            token_embeddings.astype(np.float32) * mask_expanded, axis=1,
        )
        sum_mask = np.sum(mask_expanded, axis=1).clip(min=1e-9)
        return sum_embeddings / sum_mask

    @staticmethod
    def _l2_normalize(embeddings: np.ndarray) -> np.ndarray:
        """L2-normalize embedding vectors to unit length."""
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms = np.clip(norms, a_min=1e-12, a_max=None)
        return embeddings / norms

    def _validate_embedding(self, vec: np.ndarray) -> None:
        """Validate a single embedding vector.

        Checks dimension and rejects NaN/Inf.
        """
        if vec.shape[0] != self._dimension:
            raise NeuralEmbeddingError(
                f"Embedding dimension mismatch: expected {self._dimension}, "
                f"got {vec.shape[0]}"
            )
        if np.any(np.isnan(vec)) or np.any(np.isinf(vec)):
            raise NeuralEmbeddingError(
                "Embedding contains NaN or Inf values — "
                "model output is invalid."
            )

    def get_health_info(self) -> dict[str, Any]:
        """Return provider health/observability information."""
        return {
            "embedding_provider": self.get_name(),
            "embedding_model": self._model_name,
            "embedding_dimension": self._dimension,
            "embedding_version": self._provider_version,
            "embedding_fingerprint": self.get_config().fingerprint(),
            "device": self.active_device,
            "model_loaded": self.model_loaded,
            "offline_mode": True,
            "normalization": "l2" if self._normalize else "none",
            "max_seq_length": self._max_seq_length,
            "batch_size": self._batch_size,
            "model_path": str(self._model_path),
        }
