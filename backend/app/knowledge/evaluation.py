"""
Retrieval evaluation dataset and framework for Sovereign AI Workbench.

A local, deterministic regression test bed for retrieval quality.
Does not use internet data. Uses synthetic/local industrial documents:
- Safety SOP (SOP-001)
- Inspection Procedure (INSP-002)
- Equipment Maintenance Manual (MAN-003)
- Internal Approval Procedure (PROC-004)

Evaluates:
- Recall@K (K=1,3,5)
- Precision@K (K=1,3,5)
- Threshold behavior
- No-evidence behavior
- Paraphrase retrieval
- Citation correctness
- TF-IDF vs Neural comparison
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from app.documents.models import Document, DocumentMetadata, DocumentPage, ExtractionStatus, FileType
from app.knowledge.chunking import ChunkingConfig, ChunkingService
from app.knowledge.embeddings import EmbeddingProvider
from app.knowledge.ingestion import KnowledgeIngestionService
from app.knowledge.retrieval import KnowledgeRetriever
from app.knowledge.tfidf_embeddings import TfidfEmbeddingProvider
from app.knowledge.vector_store import VectorStore
from app.knowledge.memory_store import InMemoryVectorStore


# ============================================================
# Synthetic Industrial Knowledge Dataset
# ============================================================

SAFETY_SOP_TEXT = """
STANDARD OPERATING PROCEDURE: INDUSTRIAL SAFETY & LOCKOUT/TAGOUT
Document ID: SOP-001
Revision: 3.2
Effective Date: 2026-01-15

1. PURPOSE & OBJECTIVE
This SOP defines mandatory safety rules and Zero Energy State (ZES) procedures
for high-voltage switchgear, hydraulic presses, and rotating machinery.

2. PERSONAL PROTECTIVE EQUIPMENT (PPE)
2.1 All employees in Zone B and C must wear arc-flash rated face shields (Category 3).
2.2 Dielectric boots rated for 15kV are mandatory when operating disconnect switches.
2.3 Cut-resistant gloves (Level 5 Kevlar) must be worn during blade replacement.

3. LOCKOUT / TAGOUT (LOTO) PROCEDURE
3.1 Notify affected operators 15 minutes before energy isolation.
3.2 Open primary circuit breakers and apply red padlock with employee ID.
3.3 Dissipate stored energy: discharge hydraulic accumulators to 0 PSI.
3.4 Verify zero energy using a calibrated multimeter before crossing boundary.
3.5 Only the lock owner may remove the padlock upon shift completion.
"""

INSPECTION_PROCEDURE_TEXT = """
STANDARD INSPECTION PROCEDURE: TURBINE BEARING VIBRATION & THERMOGRAPHY
Document ID: INSP-002
Revision: 1.0
Effective Date: 2026-02-01

1. INSPECTION FREQUENCY
1.1 Daily acoustic checks with ultrasonic listening devices.
1.2 Bi-weekly tri-axial vibration spectrum analysis on all journal bearings.
1.3 Monthly infrared thermography scans of motor terminal boxes.

2. ACCEPTANCE CRITERIA & ALARM THRESHOLDS
2.1 Overall vibration velocity RMS:
    - Good: < 2.8 mm/s
    - Alert: 2.8 to 4.5 mm/s
    - Danger / Immediate Shutdown: > 4.5 mm/s
2.2 Bearing temperature limits:
    - Normal operating range: 60°C to 80°C
    - Alarm threshold: 85°C
    - Trip threshold: 95°C

3. CORRECTIVE ACTIONS UPON THRESHOLD EXCEEDANCE
3.1 If vibration exceeds 4.5 mm/s, immediately trip turbine and engage turning gear.
3.2 If bearing temperature reaches 85°C, increase oil cooler flow rate by 30%.
3.3 Document all alarm excursions in Form INSP-F-402 within 2 hours.
"""

MAINTENANCE_MANUAL_TEXT = """
EQUIPMENT MAINTENANCE MANUAL: MODEL T-400 HIGH-PRESSURE TURBINE
Document ID: MAN-003
Revision: 4.1
Effective Date: 2025-11-20

1. LUBRICATION SYSTEM SPECIFICATIONS
1.1 Use only ISO VG 46 high-grade turbine oil with rust and oxidation inhibitors.
1.2 Reservoir capacity: 200 liters.
1.3 Minimum allowable oil supply pressure during operation: 1.8 bar gauge.
1.4 Oil filter replacement interval: every 2000 operating hours or when differential pressure reaches 0.5 bar.

2. STARTUP & COMMISSIONING SEQUENCE
2.1 Step 1: Verify lube oil reservoir level in upper third of sight glass.
2.2 Step 2: Start electric auxiliary lube pump; verify pressure stabilizes at 2.0 bar.
2.3 Step 3: Engage hydraulic turning gear for at least 45 minutes to prevent shaft bow.
2.4 Step 4: Open gland steam seal supply valve.
2.5 Step 5: Roll turbine off turning gear, accelerating to idle speed (1200 RPM) at 100 RPM/min.

3. SHUTDOWN & COOLDOWN SEQUENCE
3.1 Unload turbine from grid over 20 minutes.
3.2 Trip main steam stop valve.
3.3 Keep turning gear running continuously until shaft temperature drops below 90°C (approx. 6 hours).
"""

APPROVAL_PROCEDURE_TEXT = """
MANAGEMENT PROCEDURE: ENGINEERING CHANGE ORDER (ECO) APPROVAL WORKFLOW
Document ID: PROC-004
Revision: 2.0
Effective Date: 2026-03-01

1. SCOPE & APPLICABILITY
Applies to all mechanical, electrical, and software modifications to Plant Unit 4.

2. APPROVAL AUTHORITY MATRIX
2.1 Tier 1 Changes (< $5,000, no safety impact): Lead Process Engineer approval.
2.2 Tier 2 Changes ($5,000 to $50,000 or minor safety impact): Plant Operations Manager.
2.3 Tier 3 Changes (> $50,000 or environmental/safety hazard): Chief Technical Officer (CTO) and Safety Director.

3. EMERGENCY REPAIR AUTHORIZATION
3.1 Shift Superintendent may authorize temporary emergency bypasses lasting up to 24 hours.
3.2 Formal retro-active ECO must be filed within 1 business day following emergency resolution.
"""


# ============================================================
# Evaluation Query Ground Truth
# ============================================================

@dataclass
class EvalQuery:
    """A test query with expected document matches and criteria."""

    query: str
    expected_doc_ids: list[str]  # Document IDs that should be in the top results
    expected_filenames: list[str]
    min_recall: float = 0.5
    min_precision: float = 0.2
    description: str = ""


EVAL_QUERIES = [
    EvalQuery(
        query="What is the procedure for lockout tagout and zero energy verification?",
        expected_doc_ids=["SOP-001"],
        expected_filenames=["Safety_SOP.txt"],
        description="LOTO procedure lookup",
    ),
    EvalQuery(
        query="What are the alarm thresholds for turbine bearing vibration velocity and temperature?",
        expected_doc_ids=["INSP-002"],
        expected_filenames=["Inspection_Procedure.txt"],
        description="Vibration and temperature thresholds",
    ),
    EvalQuery(
        query="What is the startup sequence for the Model T-400 turbine and turning gear time?",
        expected_doc_ids=["MAN-003"],
        expected_filenames=["Maintenance_Manual.txt"],
        description="Turbine startup sequence",
    ),
    EvalQuery(
        query="Who has approval authority for Tier 3 engineering change orders exceeding fifty thousand dollars?",
        expected_doc_ids=["PROC-004"],
        expected_filenames=["Approval_Procedure.txt"],
        description="ECO approval authority matrix",
    ),
    EvalQuery(
        query="What type of oil and filter replacement interval is specified for turbine lubrication?",
        expected_doc_ids=["MAN-003"],
        expected_filenames=["Maintenance_Manual.txt"],
        description="Oil and filter specification",
    ),
]


# ============================================================
# Evaluation Engine
# ============================================================

@dataclass
class EvaluationMetrics:
    """Aggregated evaluation results."""

    total_queries: int = 0
    mean_recall_at_k: float = 0.0
    mean_precision_at_k: float = 0.0
    no_evidence_accuracy: float = 0.0
    threshold_accuracy: float = 0.0
    citation_accuracy: float = 0.0
    query_details: list[dict[str, Any]] = field(default_factory=list)


def build_evaluation_corpus() -> list[Document]:
    """Create the synthetic test documents."""
    docs = [
        Document(
            document_id="SOP-001",
            filename="Safety_SOP.txt",
            file_type=FileType.TXT,
            file_size=len(SAFETY_SOP_TEXT.encode()),
            page_count=1,
            extraction_status=ExtractionStatus.TEXT_EXTRACTED,
            text=SAFETY_SOP_TEXT,
            pages=[DocumentPage(page_number=1, text=SAFETY_SOP_TEXT, source="text_extraction")],
            metadata=DocumentMetadata(original_filename="Safety_SOP.txt"),
        ),
        Document(
            document_id="INSP-002",
            filename="Inspection_Procedure.txt",
            file_type=FileType.TXT,
            file_size=len(INSPECTION_PROCEDURE_TEXT.encode()),
            page_count=1,
            extraction_status=ExtractionStatus.TEXT_EXTRACTED,
            text=INSPECTION_PROCEDURE_TEXT,
            pages=[DocumentPage(page_number=1, text=INSPECTION_PROCEDURE_TEXT, source="text_extraction")],
            metadata=DocumentMetadata(original_filename="Inspection_Procedure.txt"),
        ),
        Document(
            document_id="MAN-003",
            filename="Maintenance_Manual.txt",
            file_type=FileType.TXT,
            file_size=len(MAINTENANCE_MANUAL_TEXT.encode()),
            page_count=1,
            extraction_status=ExtractionStatus.TEXT_EXTRACTED,
            text=MAINTENANCE_MANUAL_TEXT,
            pages=[DocumentPage(page_number=1, text=MAINTENANCE_MANUAL_TEXT, source="text_extraction")],
            metadata=DocumentMetadata(original_filename="Maintenance_Manual.txt"),
        ),
        Document(
            document_id="PROC-004",
            filename="Approval_Procedure.txt",
            file_type=FileType.TXT,
            file_size=len(APPROVAL_PROCEDURE_TEXT.encode()),
            page_count=1,
            extraction_status=ExtractionStatus.TEXT_EXTRACTED,
            text=APPROVAL_PROCEDURE_TEXT,
            pages=[DocumentPage(page_number=1, text=APPROVAL_PROCEDURE_TEXT, source="text_extraction")],
            metadata=DocumentMetadata(original_filename="Approval_Procedure.txt"),
        ),
    ]
    return docs


def run_retrieval_evaluation(
    retriever: KnowledgeRetriever,
    queries: list[EvalQuery] = EVAL_QUERIES,
    top_k: int = 5,
) -> EvaluationMetrics:
    """Run evaluation benchmark across all test queries."""
    recalls = []
    precisions = []
    details = []

    for eq in queries:
        results, _ = retriever.retrieve(eq.query, top_k=top_k)
        retrieved_doc_ids = [r.document_id for r in results]
        retrieved_filenames = [r.filename for r in results]

        # Calculate Recall@K (did we find expected docs?)
        expected_set = set(eq.expected_doc_ids)
        found_set = set(retrieved_doc_ids) & expected_set
        recall = len(found_set) / len(expected_set) if expected_set else 1.0

        # Calculate Precision@K
        precision = len(found_set) / len(retrieved_doc_ids) if retrieved_doc_ids else 0.0

        recalls.append(recall)
        precisions.append(precision)
        details.append({
            "query": eq.query,
            "description": eq.description,
            "expected_doc_ids": eq.expected_doc_ids,
            "retrieved_doc_ids": retrieved_doc_ids,
            "recall": recall,
            "precision": precision,
        })

    return EvaluationMetrics(
        total_queries=len(queries),
        mean_recall_at_k=sum(recalls) / len(recalls) if recalls else 0.0,
        mean_precision_at_k=sum(precisions) / len(precisions) if precisions else 0.0,
        query_details=details,
    )


# ============================================================
# Paraphrase / Semantic Evaluation Queries
# ============================================================

PARAPHRASE_QUERIES = [
    # Paraphrases of existing exact-match queries
    EvalQuery(
        query="How do I isolate energy and verify zero energy state on equipment?",
        expected_doc_ids=["SOP-001"],
        expected_filenames=["Safety_SOP.txt"],
        description="Paraphrase: LOTO procedure (semantic rewording)",
    ),
    EvalQuery(
        query="What conditions require an immediate turbine shutdown?",
        expected_doc_ids=["INSP-002"],
        expected_filenames=["Inspection_Procedure.txt"],
        description="Paraphrase: vibration alarm thresholds",
    ),
    EvalQuery(
        query="How long should the turning gear run before starting the turbine?",
        expected_doc_ids=["MAN-003"],
        expected_filenames=["Maintenance_Manual.txt"],
        description="Paraphrase: startup turning gear time",
    ),
    EvalQuery(
        query="Which manager signs off on high-cost plant modifications?",
        expected_doc_ids=["PROC-004"],
        expected_filenames=["Approval_Procedure.txt"],
        description="Paraphrase: ECO approval for expensive changes",
    ),
    # New paraphrase queries testing deeper semantic understanding
    EvalQuery(
        query="At what condition should the air filter be replaced?",
        expected_doc_ids=["MAN-003"],
        expected_filenames=["Maintenance_Manual.txt"],
        description="Paraphrase: oil filter replacement condition",
    ),
    EvalQuery(
        query="What protective gear is required near high-voltage switchgear?",
        expected_doc_ids=["SOP-001"],
        expected_filenames=["Safety_SOP.txt"],
        description="Paraphrase: PPE for high-voltage areas",
    ),
    EvalQuery(
        query="What should be checked on the turbine bearing regularly?",
        expected_doc_ids=["INSP-002"],
        expected_filenames=["Inspection_Procedure.txt"],
        description="Paraphrase: bearing inspection requirements",
    ),
    EvalQuery(
        query="Who can authorize a temporary emergency bypass?",
        expected_doc_ids=["PROC-004"],
        expected_filenames=["Approval_Procedure.txt"],
        description="Paraphrase: emergency repair authorization",
    ),
]


NO_EVIDENCE_QUERIES = [
    EvalQuery(
        query="What is the recipe for chocolate cake?",
        expected_doc_ids=[],
        expected_filenames=[],
        description="No-evidence: completely unrelated (cooking)",
    ),
    EvalQuery(
        query="Explain the theory of quantum entanglement.",
        expected_doc_ids=[],
        expected_filenames=[],
        description="No-evidence: unrelated domain (physics)",
    ),
    EvalQuery(
        query="How do I configure a Kubernetes cluster for auto-scaling?",
        expected_doc_ids=[],
        expected_filenames=[],
        description="No-evidence: unrelated domain (IT/DevOps)",
    ),
]


# Combined full evaluation set
ALL_EVAL_QUERIES = EVAL_QUERIES + PARAPHRASE_QUERIES + NO_EVIDENCE_QUERIES


# ============================================================
# Extended Evaluation with Multi-K Metrics
# ============================================================

@dataclass
class EmbeddingEvaluationResult:
    """Comprehensive evaluation results for a single embedding provider.

    Records per-K recall/precision, latency, and provider metadata.
    """

    provider: str = ""
    model: str = ""
    dimension: int = 0
    device: str = ""

    # Metrics at K=1,3,5
    recall_at_1: float = 0.0
    recall_at_3: float = 0.0
    recall_at_5: float = 0.0
    precision_at_1: float = 0.0
    precision_at_3: float = 0.0
    precision_at_5: float = 0.0

    # Paraphrase-specific metrics at K=5
    paraphrase_recall_at_5: float = 0.0
    paraphrase_precision_at_5: float = 0.0

    # No-evidence accuracy (fraction where no results above threshold)
    no_evidence_accuracy: float = 0.0

    # Latency (milliseconds)
    avg_embedding_latency_ms: float = 0.0
    avg_retrieval_latency_ms: float = 0.0
    total_evaluation_time_ms: float = 0.0

    # Per-query details
    query_details: list[dict[str, Any]] = field(default_factory=list)

    # Similarity threshold used
    similarity_threshold: float = 0.0


def _compute_recall_precision(
    results: list[Any],
    expected_doc_ids: list[str],
    k: int,
) -> tuple[float, float]:
    """Compute Recall@K and Precision@K for a single query."""
    retrieved = [r.document_id for r in results[:k]]
    expected_set = set(expected_doc_ids)
    if not expected_set:
        # No-evidence query: precision/recall are N/A, measured separately
        return 1.0 if not retrieved else 0.0, 1.0 if not retrieved else 0.0
    found = set(retrieved) & expected_set
    recall = len(found) / len(expected_set)
    precision = len(found) / len(retrieved) if retrieved else 0.0
    return recall, precision


def run_embedding_evaluation(
    embedding_provider: EmbeddingProvider,
    *,
    exact_queries: list[EvalQuery] | None = None,
    paraphrase_queries: list[EvalQuery] | None = None,
    no_evidence_queries: list[EvalQuery] | None = None,
    similarity_threshold: float = 0.05,
    top_k: int = 5,
) -> EmbeddingEvaluationResult:
    """Run a full evaluation of an embedding provider against the industrial corpus.

    Builds a fresh knowledge system, ingests the standard evaluation
    corpus, then measures retrieval quality at K=1,3,5 for exact,
    paraphrase, and no-evidence queries.

    Args:
        embedding_provider: The provider to evaluate.
        exact_queries: Exact-match queries (default: EVAL_QUERIES).
        paraphrase_queries: Paraphrase queries (default: PARAPHRASE_QUERIES).
        no_evidence_queries: Irrelevant queries (default: NO_EVIDENCE_QUERIES).
        similarity_threshold: The threshold to apply during retrieval.
        top_k: Maximum results to retrieve per query.

    Returns:
        EmbeddingEvaluationResult with all metrics.
    """
    total_start = time.monotonic()

    if exact_queries is None:
        exact_queries = EVAL_QUERIES
    if paraphrase_queries is None:
        paraphrase_queries = PARAPHRASE_QUERIES
    if no_evidence_queries is None:
        no_evidence_queries = NO_EVIDENCE_QUERIES

    # Build fresh knowledge system
    chunking_service = ChunkingService(config=ChunkingConfig())
    vector_store = InMemoryVectorStore()
    ingestion_service = KnowledgeIngestionService(
        chunking_service=chunking_service,
        embedding_provider=embedding_provider,
        vector_store=vector_store,
    )

    # Ingest evaluation corpus
    corpus = build_evaluation_corpus()
    for doc in corpus:
        ingestion_service.ingest(doc)

    retriever = KnowledgeRetriever(
        embedding_provider=embedding_provider,
        vector_store=vector_store,
        ingestion_service=ingestion_service,
        default_top_k=top_k,
        similarity_threshold=similarity_threshold,
    )

    # --- Evaluate exact queries at K=1,3,5 ---
    exact_recalls = {1: [], 3: [], 5: []}
    exact_precisions = {1: [], 3: [], 5: []}
    all_details: list[dict[str, Any]] = []
    latencies: list[float] = []

    for eq in exact_queries:
        embed_start = time.monotonic()
        results, retrieval_time = retriever.retrieve(eq.query, top_k=top_k)
        latencies.append(retrieval_time)

        detail: dict[str, Any] = {
            "query": eq.query,
            "description": eq.description,
            "category": "exact",
            "expected_doc_ids": eq.expected_doc_ids,
            "retrieved_doc_ids": [r.document_id for r in results],
            "scores": [round(r.score, 4) for r in results],
            "retrieval_time_ms": round(retrieval_time, 2),
        }

        for k in (1, 3, 5):
            recall, precision = _compute_recall_precision(results, eq.expected_doc_ids, k)
            exact_recalls[k].append(recall)
            exact_precisions[k].append(precision)
            detail[f"recall_at_{k}"] = recall
            detail[f"precision_at_{k}"] = precision

        all_details.append(detail)

    # --- Evaluate paraphrase queries at K=5 ---
    para_recalls: list[float] = []
    para_precisions: list[float] = []

    for eq in paraphrase_queries:
        results, retrieval_time = retriever.retrieve(eq.query, top_k=top_k)
        latencies.append(retrieval_time)

        recall, precision = _compute_recall_precision(results, eq.expected_doc_ids, 5)
        para_recalls.append(recall)
        para_precisions.append(precision)

        all_details.append({
            "query": eq.query,
            "description": eq.description,
            "category": "paraphrase",
            "expected_doc_ids": eq.expected_doc_ids,
            "retrieved_doc_ids": [r.document_id for r in results],
            "scores": [round(r.score, 4) for r in results],
            "recall_at_5": recall,
            "precision_at_5": precision,
            "retrieval_time_ms": round(retrieval_time, 2),
        })

    # --- Evaluate no-evidence queries ---
    no_evidence_correct = 0
    for eq in no_evidence_queries:
        results, retrieval_time = retriever.retrieve(eq.query, top_k=top_k)
        latencies.append(retrieval_time)

        # For no-evidence, we check that no results or all scores are very low
        has_strong_match = any(r.score >= similarity_threshold for r in results)
        # These queries should ideally return NO results above threshold
        if not has_strong_match or len(results) == 0:
            no_evidence_correct += 1

        all_details.append({
            "query": eq.query,
            "description": eq.description,
            "category": "no_evidence",
            "expected_doc_ids": [],
            "retrieved_doc_ids": [r.document_id for r in results],
            "scores": [round(r.score, 4) for r in results],
            "correct_no_evidence": not has_strong_match or len(results) == 0,
            "retrieval_time_ms": round(retrieval_time, 2),
        })

    total_time = (time.monotonic() - total_start) * 1000

    # --- Measure embedding latency ---
    embed_latencies: list[float] = []
    for _ in range(5):
        start = time.monotonic()
        embedding_provider.embed("sample query for latency measurement")
        embed_latencies.append((time.monotonic() - start) * 1000)

    config = embedding_provider.get_config()

    return EmbeddingEvaluationResult(
        provider=config.provider,
        model=config.model_name,
        dimension=config.dimension,
        device=getattr(embedding_provider, "active_device", "cpu"),
        recall_at_1=_safe_mean(exact_recalls[1]),
        recall_at_3=_safe_mean(exact_recalls[3]),
        recall_at_5=_safe_mean(exact_recalls[5]),
        precision_at_1=_safe_mean(exact_precisions[1]),
        precision_at_3=_safe_mean(exact_precisions[3]),
        precision_at_5=_safe_mean(exact_precisions[5]),
        paraphrase_recall_at_5=_safe_mean(para_recalls),
        paraphrase_precision_at_5=_safe_mean(para_precisions),
        no_evidence_accuracy=(
            no_evidence_correct / len(no_evidence_queries)
            if no_evidence_queries else 0.0
        ),
        avg_embedding_latency_ms=_safe_mean(embed_latencies),
        avg_retrieval_latency_ms=_safe_mean(latencies),
        total_evaluation_time_ms=round(total_time, 2),
        query_details=all_details,
        similarity_threshold=similarity_threshold,
    )


def _safe_mean(values: list[float]) -> float:
    """Compute mean, returning 0.0 for empty lists."""
    return round(sum(values) / len(values), 4) if values else 0.0
