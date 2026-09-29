"""
Approval Note Workflow — end-to-end pipeline.

Takes a document_id, retrieves relevant chunks via RAG, extracts key
findings with the LLM, drafts a formal approval note, and exports to DOCX.

Steps:
  1. Validate document exists in document store
  2. Check if document is ingested into knowledge base (ingest if needed)
  3. Retrieve scoped chunks from knowledge base
  4. LLM call #1: extract key findings with citations
  5. LLM call #2: draft formal approval note in structured markdown
  6. Export to DOCX
  7. Audit log entry
"""

from __future__ import annotations

import logging
import time
import uuid
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from app.config import get_settings
from app.models.base import GenerationRequest
from app.models.registry import ModelRegistry
from app.knowledge.retrieval import KnowledgeRetriever
from app.knowledge.ingestion import KnowledgeIngestionService
from app.documents.store import DocumentStore
from app.security.audit import AuditService
from app.services.export_service import ExportService

logger = logging.getLogger(__name__)


class ApprovalNoteCitation(BaseModel):
    document_id: str
    filename: str = ""
    page: Optional[int] = None
    section: Optional[str] = None
    relevance_score: float = 0.0


class ApprovalNoteResult(BaseModel):
    run_id: str
    document_id: str
    model: str
    steps: list[dict]
    findings: str
    citations: list[ApprovalNoteCitation]
    note_markdown: str
    download_url: str


# ── Prompts ──────────────────────────────────────────────────────────────────

_FINDINGS_SYSTEM = (
    "You are an industrial analyst reading an inspection or technical report. "
    "Extract the key findings, observations, defects, non-conformances, and "
    "recommendations as concise bullet points. Cite source references."
)

_NOTE_SYSTEM = (
    "You are a technical writer drafting formal approval notes for an "
    "industrial organisation (refinery/PSU). Write in professional, "
    "precise language. Use the following structure:\n\n"
    "## Subject\n## Background\n## Key Findings\n"
    "## Assessment\n## Recommendation\n## Approval\n\n"
    "Ground the note in the findings and citations provided. "
    "Do not fabricate information."
)


class ApprovalWorkflowService:
    """Orchestrates the approval-note workflow pipeline."""

    def __init__(
        self,
        *,
        registry: ModelRegistry,
        retriever: KnowledgeRetriever,
        ingestion_service: KnowledgeIngestionService,
        document_store: DocumentStore,
        export_service: ExportService,
        audit_service: AuditService,
    ) -> None:
        self._registry = registry
        self._retriever = retriever
        self._ingestion = ingestion_service
        self._document_store = document_store
        self._export = export_service
        self._audit = audit_service
        self._settings = get_settings()

    def artifact_path(self, document_id: str) -> Path:
        """Return the path where the DOCX artifact is stored."""
        safe_id = document_id.replace("/", "").replace("\\", "").replace("..", "")
        path = self._settings.outputs_dir / safe_id / "approval_note.docx"
        return path

    def run(
        self,
        *,
        document_id: str,
        title: Optional[str] = None,
        instructions: Optional[str] = None,
    ) -> ApprovalNoteResult:
        """Execute the full pipeline and return structured results."""
        run_id = str(uuid.uuid4())
        steps: list[dict] = []
        t_start = time.time()

        # ── Step 1: Verify document exists ───────────────────────────────
        doc = self._document_store.get_document(document_id)
        if doc is None:
            raise ValueError(f"Document '{document_id}' not found.")

        steps.append({
            "step": "validate_document",
            "status": "completed",
            "elapsed_ms": round((time.time() - t_start) * 1000),
        })

        # ── Step 2: Check knowledge base ingestion ──────────────────────
        if not self._ingestion.is_ingested(document_id):
            t_ingest = time.time()
            logger.info(
                "Document %s not in knowledge base — ingesting now",
                document_id,
            )
            self._ingestion.ingest(doc)
            steps.append({
                "step": "ingest_document",
                "status": "completed",
                "elapsed_ms": round((time.time() - t_ingest) * 1000),
            })

        # ── Step 3: Retrieve relevant chunks ────────────────────────────
        t_retrieve = time.time()
        query = instructions or (
            "key findings, observations, defects, non-conformances "
            "and recommendations in this report"
        )
        results, retrieval_time_ms = self._retriever.retrieve(
            query=query, top_k=8,
        )

        if not results:
            raise ValueError(
                f"No indexed content found for document '{document_id}'."
            )

        # Build context string
        context_parts = []
        citations: list[ApprovalNoteCitation] = []
        for i, r in enumerate(results, 1):
            text = r.chunk.text
            source = r.filename
            page = r.page_number
            section = r.section
            score = r.score

            context_parts.append(
                f"[Source {i}: {source}"
                + (f", Page {page}" if page else "")
                + (f", Section: {section}" if section else "")
                + f"]\n{text}"
            )
            citations.append(ApprovalNoteCitation(
                document_id=r.document_id,
                filename=source,
                page=page,
                section=section,
                relevance_score=round(score, 4),
            ))

        context = "\n\n".join(context_parts)
        steps.append({
            "step": "retrieve_chunks",
            "status": "completed",
            "chunks_found": len(results),
            "elapsed_ms": round((time.time() - t_retrieve) * 1000),
        })

        # ── Step 4: LLM call #1 — extract findings ─────────────────────
        t_findings = time.time()
        available = self._registry.get_available(preferred="general")
        if available is None:
            raise RuntimeError(
                "No LLM provider available. Start llama-server first."
            )
        name, provider = available

        findings_prompt = (
            f"Extract the key findings as concise bullet points, "
            f"citing sources.\n\n{context}"
        )
        findings_resp = provider.generate(GenerationRequest(
            prompt=findings_prompt,
            system_prompt=_FINDINGS_SYSTEM,
            max_tokens=1024,
            temperature=0.2,
        ))
        findings = findings_resp.text

        steps.append({
            "step": "extract_findings",
            "model": findings_resp.model_name,
            "status": "completed",
            "elapsed_ms": round((time.time() - t_findings) * 1000),
        })

        # ── Step 5: LLM call #2 — draft approval note ──────────────────
        t_note = time.time()
        note_prompt = (
            f"Based on the following findings and citations, "
            f"draft a formal approval note.\n\n"
            f"**Findings:**\n{findings}\n\n"
            f"**Source Citations:**\n"
            + "\n".join(
                f"- {c.filename}"
                + (f" (Page {c.page})" if c.page else "")
                + (f" — {c.section}" if c.section else "")
                for c in citations
            )
        )
        note_resp = provider.generate(GenerationRequest(
            prompt=note_prompt,
            system_prompt=_NOTE_SYSTEM,
            max_tokens=2048,
            temperature=0.2,
        ))
        note_markdown = note_resp.text

        steps.append({
            "step": "draft_approval_note",
            "model": note_resp.model_name,
            "status": "completed",
            "elapsed_ms": round((time.time() - t_note) * 1000),
        })

        # ── Step 6: Export to DOCX ──────────────────────────────────────
        t_export = time.time()
        docx_bytes = self._export.markdown_to_docx(
            title or "Approval Note", note_markdown,
        )

        output_path = self.artifact_path(document_id)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(docx_bytes)

        download_url = f"/workflows/approval-note/{document_id}/download"

        steps.append({
            "step": "export_docx",
            "status": "completed",
            "file_size_bytes": len(docx_bytes),
            "elapsed_ms": round((time.time() - t_export) * 1000),
        })

        # ── Step 7: Audit ───────────────────────────────────────────────
        total_ms = round((time.time() - t_start) * 1000)
        self._audit.record(
            task=f"approval_workflow:{document_id}",
            selected_model=name,
            execution_status="completed",
            metadata={
                "run_id": run_id,
                "total_ms": total_ms,
                "steps": len(steps),
            },
        )

        steps.append({
            "step": "audit_logged",
            "status": "completed",
            "total_elapsed_ms": total_ms,
        })

        return ApprovalNoteResult(
            run_id=run_id,
            document_id=document_id,
            model=name,
            steps=steps,
            findings=findings,
            citations=citations,
            note_markdown=note_markdown,
            download_url=download_url,
        )
