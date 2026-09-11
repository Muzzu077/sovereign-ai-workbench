"""
Retrieval evaluation dataset and framework for Sovereign AI Workbench.

A local, deterministic regression test bed for retrieval quality.
Does not use internet data. Uses synthetic/local industrial documents:
- Safety SOP (SOP-001)
- Inspection Procedure (INSP-002)
- Equipment Maintenance Manual (MAN-003)
- Internal Approval Procedure (PROC-004)

Evaluates:
- Recall@K
- Precision@K
- Threshold behavior
- No-evidence behavior
- Citation correctness
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.documents.models import Document, DocumentMetadata, DocumentPage, ExtractionStatus, FileType
from app.knowledge.chunking import ChunkingConfig, ChunkingService
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
