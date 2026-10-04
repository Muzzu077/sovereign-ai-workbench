"""
Benchmark infrastructure for Sovereign AI Workbench.

Provides offline-capable benchmarks for:
- Text chunking throughput
- Embedding latency
- Retrieval quality (Recall@K via evaluation.py)
- Document processing throughput
- Overall system profile

All benchmarks run locally with synthetic data — no LLM server
or external services required.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Synthetic benchmark corpus
# ---------------------------------------------------------------------------

_SYNTHETIC_PARAGRAPHS = [
    (
        "Lockout/Tagout (LOTO) procedures must be followed before performing any "
        "maintenance on rotating equipment. Step 1: Notify all affected personnel. "
        "Step 2: Shut down the equipment using normal operating procedures. "
        "Step 3: Isolate all energy sources including electrical, hydraulic, and pneumatic. "
        "Step 4: Apply lockout/tagout devices at each energy isolation point. "
        "Step 5: Verify zero energy state using calibrated test equipment."
    ),
    (
        "Turbine inspection procedure INSP-002 requires visual examination of "
        "all first-stage blades at 4,000-hour intervals. Blade erosion exceeding "
        "0.5mm depth or 10mm length requires immediate replacement. Record all "
        "measurements in the digital inspection log with photographic evidence. "
        "Vibration analysis must show fundamental frequency within 2% of baseline."
    ),
    (
        "Emergency shutdown sequence: Activate ESD-1 from any control room console. "
        "This initiates automatic isolation of fuel gas, combustion air, and cooling "
        "water systems. Steam injection for turbine coast-down begins within 3 seconds. "
        "Total shutdown time from ESD activation to full stop: 45 seconds maximum."
    ),
    (
        "Quality assurance manual section 7.3: All welding on pressure vessels must comply "
        "with ASME Section IX. Welders must hold valid certifications for the specific "
        "joint configuration and material grade. Post-weld heat treatment is mandatory "
        "for carbon steel thickness exceeding 32mm. Non-destructive examination (NDE) "
        "includes ultrasonic testing at 100% of butt welds."
    ),
    (
        "Cooling water treatment program: Maintain pH between 7.0 and 8.5. "
        "Total dissolved solids must not exceed 1500 ppm. Conduct microbiological "
        "testing weekly. Legionella risk assessment quarterly. Biocide dosing "
        "should achieve 0.5-1.0 ppm free residual chlorine at return headers."
    ),
]

# Repeat paragraphs to create a larger corpus for throughput testing
BENCHMARK_CORPUS = "\n\n".join(_SYNTHETIC_PARAGRAPHS * 20)  # ~10,000 words


# ---------------------------------------------------------------------------
# Result models
# ---------------------------------------------------------------------------

class ChunkingBenchmark(BaseModel):
    """Results of chunking throughput benchmark."""
    corpus_chars: int
    corpus_words: int
    chunks_produced: int
    chunk_size: int
    chunk_overlap: int
    total_ms: float
    chars_per_second: float
    chunks_per_second: float


class EmbeddingBenchmark(BaseModel):
    """Results of embedding latency benchmark."""
    provider: str
    dimension: int
    sample_count: int
    total_ms: float
    avg_ms_per_embed: float
    embeds_per_second: float


class SystemProfile(BaseModel):
    """Complete benchmark profile."""
    timestamp: str
    chunking: ChunkingBenchmark
    embedding: EmbeddingBenchmark
    total_benchmark_ms: float


# ---------------------------------------------------------------------------
# Benchmark runner
# ---------------------------------------------------------------------------

class BenchmarkRunner:
    """Runs offline benchmarks against local subsystems.

    Usage::

        runner = BenchmarkRunner(
            chunking_service=chunking_svc,
            embedding_provider=embedding_prov,
        )
        profile = runner.run_all()
    """

    def __init__(
        self,
        chunking_service: Any,
        embedding_provider: Any,
    ) -> None:
        self._chunking = chunking_service
        self._embedding = embedding_provider

    def run_all(self) -> SystemProfile:
        """Run full benchmark suite and return a SystemProfile."""
        import datetime

        overall_start = time.perf_counter()

        chunking_result = self._benchmark_chunking()
        embedding_result = self._benchmark_embedding()

        overall_ms = (time.perf_counter() - overall_start) * 1000

        return SystemProfile(
            timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            chunking=chunking_result,
            embedding=embedding_result,
            total_benchmark_ms=round(overall_ms, 2),
        )

    def _benchmark_chunking(self) -> ChunkingBenchmark:
        """Measure chunking throughput on synthetic corpus."""
        from app.documents.models import Document, FileType, ExtractionStatus

        corpus = BENCHMARK_CORPUS
        corpus_chars = len(corpus)
        corpus_words = len(corpus.split())

        config = self._chunking.config if hasattr(self._chunking, "config") else None

        # Create a synthetic Document for the chunking service
        doc = Document(
            document_id="benchmark-doc",
            filename="benchmark.txt",
            file_type=FileType.TXT,
            file_size=corpus_chars,
            page_count=1,
            extraction_status=ExtractionStatus.TEXT_EXTRACTED,
            text=corpus,
        )

        start = time.perf_counter()
        chunks = self._chunking.chunk_document(doc)
        elapsed = time.perf_counter() - start
        elapsed_ms = elapsed * 1000

        chunk_count = len(chunks)

        return ChunkingBenchmark(
            corpus_chars=corpus_chars,
            corpus_words=corpus_words,
            chunks_produced=chunk_count,
            chunk_size=config.chunk_size if config else 0,
            chunk_overlap=config.chunk_overlap if config else 0,
            total_ms=round(elapsed_ms, 2),
            chars_per_second=round(corpus_chars / elapsed, 0) if elapsed > 0 else 0,
            chunks_per_second=round(chunk_count / elapsed, 2) if elapsed > 0 else 0,
        )

    def _benchmark_embedding(self) -> EmbeddingBenchmark:
        """Measure embedding latency on sample texts."""
        samples = [
            "lockout tagout procedure safety",
            "turbine blade inspection frequency",
            "emergency shutdown sequence activation",
            "welding certification pressure vessel",
            "cooling water treatment pH levels",
            "vibration analysis baseline comparison",
            "non-destructive examination ultrasonic",
            "hydraulic system pressure isolation",
            "combustion air fuel gas ratio",
            "post-weld heat treatment carbon steel",
        ]

        provider_name = (
            self._embedding.get_name()
            if hasattr(self._embedding, "get_name")
            else type(self._embedding).__name__
        )
        dimension = (
            self._embedding.dimension()
            if callable(getattr(self._embedding, "dimension", None))
            else getattr(self._embedding, "dimension", 0)
        )

        latencies: list[float] = []
        for sample in samples:
            t0 = time.perf_counter()
            self._embedding.embed(sample)
            latencies.append((time.perf_counter() - t0) * 1000)

        total_ms = sum(latencies)
        avg_ms = total_ms / len(latencies) if latencies else 0
        eps = (len(latencies) / (total_ms / 1000)) if total_ms > 0 else 0

        return EmbeddingBenchmark(
            provider=provider_name,
            dimension=dimension,
            sample_count=len(samples),
            total_ms=round(total_ms, 2),
            avg_ms_per_embed=round(avg_ms, 2),
            embeds_per_second=round(eps, 2),
        )
