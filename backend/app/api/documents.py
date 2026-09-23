"""
Document analysis API routes.

Provides the ``POST /documents/{id}/analyze`` endpoint that takes
a normalized document and sends it through the local Gemma model
for structured analysis.
"""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.documents.models import ExtractionStatus
from app.models.base import GenerationRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])


class AnalysisResult(BaseModel):
    """Structured analysis response from the local LLM."""

    document_id: str
    summary: str
    key_findings: list[str]
    risks: list[str]
    action_items: list[str]


def _build_analysis_prompt(text: str, filename: str) -> str:
    """Build a controlled prompt for document analysis.

    The prompt instructs the model to return structured analysis
    without hallucinating content not present in the document.
    """
    # Truncate to a reasonable context window size
    max_prompt_chars = 6000
    if len(text) > max_prompt_chars:
        text = text[:max_prompt_chars] + "\n\n[Document truncated for analysis]"

    return f"""Analyze the following document and provide a structured response.

Document filename: {filename}

--- DOCUMENT TEXT ---
{text}
--- END DOCUMENT TEXT ---

Provide your analysis in the following format:

SUMMARY: A concise 2-3 sentence summary of the document.

KEY FINDINGS:
- Finding 1
- Finding 2
- Finding 3

RISKS:
- Risk 1
- Risk 2

ACTION ITEMS:
- Action 1
- Action 2

Rules:
- Only mention information actually present in the document.
- If the document has no identifiable risks, write "No risks identified."
- If no action items are apparent, write "No action items identified."
- Be concise and factual."""


def _parse_analysis(text: str) -> dict[str, str | list[str]]:
    """Parse the LLM's text output into structured fields.

    This is a best-effort parser. If the model's output doesn't
    match the expected format, raw text is returned as the summary.
    """
    summary = ""
    key_findings: list[str] = []
    risks: list[str] = []
    action_items: list[str] = []

    current_section = "summary"

    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue

        upper = stripped.upper()

        if upper.startswith("SUMMARY:"):
            current_section = "summary"
            rest = stripped[len("SUMMARY:"):].strip()
            if rest:
                summary = rest
            continue
        elif upper.startswith("KEY FINDINGS:") or upper.startswith("KEY FINDINGS"):
            current_section = "findings"
            continue
        elif upper.startswith("RISKS:") or upper.startswith("RISKS"):
            current_section = "risks"
            continue
        elif upper.startswith("ACTION ITEMS:") or upper.startswith("ACTION ITEMS"):
            current_section = "actions"
            continue

        if current_section == "summary":
            if summary:
                summary += " " + stripped
            else:
                summary = stripped
        elif current_section == "findings":
            item = stripped.lstrip("-•* ").strip()
            if item:
                key_findings.append(item)
        elif current_section == "risks":
            item = stripped.lstrip("-•* ").strip()
            if item and item.lower() != "no risks identified.":
                risks.append(item)
        elif current_section == "actions":
            item = stripped.lstrip("-•* ").strip()
            if item and item.lower() != "no action items identified.":
                action_items.append(item)

    # Fallback: if parsing failed completely, use raw text
    if not summary and not key_findings:
        summary = text[:500]

    return {
        "summary": summary,
        "key_findings": key_findings,
        "risks": risks,
        "action_items": action_items,
    }


@router.post("/{document_id}/analyze", response_model=AnalysisResult)
def analyze_document(document_id: str, request: Request) -> AnalysisResult:
    """Analyze a document using the local Gemma model.

    Retrieves the normalized document, builds a controlled prompt,
    sends it to the local LLM, and returns structured analysis.

    The document must have text content (extraction_status must be
    TEXT_EXTRACTED or OCR_COMPLETED).
    """
    doc_store = request.app.state.document_store
    registry = request.app.state.registry
    audit = request.app.state.audit_service

    # --- Retrieve document ---
    document = doc_store.get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    if document.extraction_status in (
        ExtractionStatus.FAILED,
        ExtractionStatus.UNSUPPORTED,
    ):
        raise HTTPException(
            status_code=422,
            detail=f"Document cannot be analyzed: "
                   f"extraction_status={document.extraction_status.value}",
        )

    if document.extraction_status == ExtractionStatus.OCR_REQUIRED:
        raise HTTPException(
            status_code=422,
            detail="Document requires OCR before analysis. "
                   "Re-upload or trigger OCR first.",
        )

    if not document.text.strip():
        raise HTTPException(
            status_code=422,
            detail="Document has no extractable text content.",
        )

    # --- Select model ---
    try:
        provider = registry.get("general")
    except KeyError:
        raise HTTPException(
            status_code=503,
            detail="No model provider available for analysis.",
        )

    if not provider.is_available():
        available = registry.get_available(preferred="local")
        if available is not None:
            provider = available[1]
        else:
            raise HTTPException(
                status_code=503,
                detail="Model provider is not currently available.",
            )

    # --- Build prompt and generate ---
    prompt = _build_analysis_prompt(document.text, document.filename)

    start_time = time.monotonic()
    try:
        gen_request = GenerationRequest(
            prompt=prompt,
            max_tokens=1024,
            temperature=0.3,
            system_prompt=(
                "You are a document analysis assistant. Analyze the provided "
                "document carefully and return structured findings. Only state "
                "facts from the document. Do not make up information."
            ),
        )
        try:
            response = provider.generate(gen_request)
        except Exception as gen_err:
            available = registry.get_available(preferred="local")
            if available is not None and available[1] is not provider:
                provider = available[1]
                response = provider.generate(gen_request)
            else:
                raise gen_err
    except Exception as exc:
        logger.error("Analysis generation failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {exc}",
        )

    duration = round(time.monotonic() - start_time, 3)

    # --- Parse response ---
    parsed = _parse_analysis(response.text)

    # --- Audit (metadata only, no document content) ---
    provider_type = getattr(provider, "get_provider_type", lambda: "unknown")()
    audit.record(
        task="document_analysis",
        selected_model="general",
        execution_status="success",
        metadata={
            "document_id": document_id,
            "filename": document.filename,
            "file_type": document.file_type.value,
            "page_count": document.page_count,
            "extraction_status": document.extraction_status.value,
            "provider": provider_type,
            "duration_seconds": duration,
            "local_inference": True,
        },
    )

    return AnalysisResult(
        document_id=document_id,
        summary=parsed["summary"],
        key_findings=parsed["key_findings"],
        risks=parsed["risks"],
        action_items=parsed["action_items"],
    )
