"""
TF-IDF embedding provider.

A lightweight, fully local embedding provider based on scikit-learn's
TF-IDF vectorizer. Requires no model download, no GPU, and no network
access — ideal for air-gapped deployments.

Design:
- Uses TfidfVectorizer with sublinear TF, L2 normalization,
  and configurable max features (dimensionality).
- The vocabulary is built from all texts added via fit() or
  incrementally via partial_fit().
- Once fitted, embed() and embed_batch() produce dense numpy
  vectors suitable for cosine similarity search.

Limitations vs. neural embeddings:
- No semantic understanding — relies on lexical overlap.
- Vocabulary must be fitted before querying.
- Not suitable for cross-lingual or paraphrase detection.

The EmbeddingProvider abstraction allows replacing this with
sentence-transformers or any other local model when available.
"""

from __future__ import annotations

import logging

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from app.knowledge.embeddings import EmbeddingProvider

logger = logging.getLogger(__name__)

_TFIDF_VERSION = 1


class TfidfEmbeddingProvider(EmbeddingProvider):
    """TF-IDF based local embedding provider.

    Args:
        max_features: Maximum vocabulary size (= embedding dimension).
            Lower values use less memory; higher values capture more
            vocabulary. Default 512 balances quality and efficiency.
        min_df: Minimum document frequency for a term to be included.
        max_df: Maximum document frequency fraction (filters stopwords).
    """

    def __init__(
        self,
        max_features: int = 512,
        min_df: int = 1,
        max_df: float = 0.95,
    ) -> None:
        self._max_features = max_features
        self._min_df = min_df
        self._max_df = max_df
        self._vectorizer = self._make_vectorizer(min_df, max_df)
        self._fitted = False
        self._corpus: list[str] = []

    def _make_vectorizer(
        self, min_df: int | float, max_df: float
    ) -> TfidfVectorizer:
        """Create a TfidfVectorizer with the given frequency thresholds."""
        return TfidfVectorizer(
            max_features=self._max_features,
            sublinear_tf=True,
            norm="l2",
            min_df=min_df,
            max_df=max_df,
            strip_accents="unicode",
            token_pattern=r"(?u)\b\w\w+\b",
        )

    @property
    def fitted(self) -> bool:
        """Whether the vectorizer has been fitted on a corpus."""
        return self._fitted

    def _safe_fit(self, corpus: list[str]) -> None:
        """Fit the vectorizer, adjusting df thresholds for small corpora.

        When the corpus has very few documents, ``max_df`` as a fraction
        can resolve to fewer documents than ``min_df`` requires.  We
        detect this and relax the thresholds automatically.
        """
        n = len(corpus)
        # Always disable frequency filtering for small corpora (<= 10 docs)
        # to ensure vocabulary terms are retained across incremental reloads
        if n <= 10:
            min_df = 1
            max_df = 1.0
        else:
            min_df = self._min_df
            max_df = self._max_df

        self._vectorizer = self._make_vectorizer(min_df, max_df)
        self._vectorizer.fit(corpus)

    def fit(self, texts: list[str]) -> None:
        """Fit the TF-IDF vocabulary on a corpus of texts.

        Must be called before embed() or embed_batch().

        Args:
            texts: List of document/chunk texts to build vocabulary from.
        """
        if not texts:
            logger.warning("fit() called with empty text list — skipping")
            return
        self._corpus = list(texts)
        self._safe_fit(self._corpus)
        self._fitted = True
        logger.info(
            "TF-IDF vectorizer fitted: %d documents, %d features",
            len(texts),
            len(self._vectorizer.vocabulary_),
        )

    def partial_fit(self, texts: list[str]) -> None:
        """Refit the vectorizer including new texts.

        Rebuilds the vocabulary from all previously seen texts plus
        the new ones. This is more expensive than fit() but ensures
        the vocabulary covers new terminology.
        """
        self._corpus.extend(texts)
        self._safe_fit(self._corpus)
        self._fitted = True

    def embed(self, text: str) -> np.ndarray:
        """Embed a single text.

        If the vectorizer is not yet fitted, fits on this single text
        first (useful for testing, but callers should prefer fit() on
        a corpus for better quality).
        """
        if not self._fitted:
            self.fit([text])
        sparse = self._vectorizer.transform([text])
        dense = sparse.toarray()[0]
        # Pad/truncate to max_features if vocabulary is smaller
        if len(dense) < self._max_features:
            padded = np.zeros(self._max_features, dtype=np.float64)
            padded[: len(dense)] = dense
            return padded
        return dense

    def embed_batch(self, texts: list[str]) -> list[np.ndarray]:
        """Embed a batch of texts.

        If the vectorizer is not yet fitted, fits on these texts first.
        """
        if not texts:
            return []
        if not self._fitted:
            self.fit(texts)
        sparse = self._vectorizer.transform(texts)
        dense = sparse.toarray()
        result = []
        for row in dense:
            if len(row) < self._max_features:
                padded = np.zeros(self._max_features, dtype=np.float64)
                padded[: len(row)] = row
                result.append(padded)
            else:
                result.append(row)
        return result

    def dimension(self) -> int:
        """Return the configured embedding dimension."""
        return self._max_features

    def get_name(self) -> str:
        return f"tfidf-{self._max_features}"

    def get_version(self) -> int:
        return _TFIDF_VERSION

    def get_model_name(self) -> str:
        return ""

    def vocabulary_size(self) -> int:
        """Return the actual vocabulary size after fitting."""
        if not self._fitted:
            return 0
        return len(self._vectorizer.vocabulary_)
