"""
RAG (Retrieval-Augmented Generation) service.

Pipeline:
    query → retrieve top-k chunks (with thresholding) → classify evidence
    → build context → call local Gemma → generate answer → return answer + citations

The prompt clearly instructs Gemma to:
- Answer only from supplied evidence
- Say when evidence is insufficient
- Not invent citations
- Distinguish retrieved evidence from inference

All evidence quality states and citation integrity guarantees are computed
and enforced by application code, NOT by the LLM.
"""

from __future__ import annotations

import logging
import time

from app.knowledge.citations import build_citations
from app.knowledge.models import EvidenceQuality, RAGMetrics, RAGResponse
from app.knowledge.retrieval import KnowledgeRetriever, classify_evidence
from app.models.base import GenerationRequest, ModelProvider

logger = logging.getLogger(__name__)

# Maximum characters of evidence to include in the prompt
_MAX_CONTEXT_CHARS = 5000


def _build_rag_prompt(
    query: str,
    evidence_blocks: list[str],
    evidence_quality: EvidenceQuality | None = None,
    insufficient: bool = False,
) -> str:
    """Build the RAG prompt with evidence context.

    The prompt is structured to ground the model's answer in
    retrieved evidence only.
    """
    is_insufficient = (
        insufficient
        or (evidence_quality == EvidenceQuality.NO_EVIDENCE)
        or not evidence_blocks
    )
    if is_insufficient:
        return (
            f"The user asked: {query}\n\n"
            "No relevant evidence was found in the knowledge base. "
            "State clearly that you do not have sufficient information to answer "
            "this question based on the available documents."
        )

    evidence_text = "\n\n---\n\n".join(evidence_blocks)

    return f"""Answer the following question using ONLY the evidence provided below.

QUESTION: {query}

--- EVIDENCE START ---
{evidence_text}
--- EVIDENCE END ---

RULES:
1. Answer ONLY based on the evidence above. Do not use prior knowledge.
2. If the evidence does not contain enough information to answer, say "The available evidence is insufficient to fully answer this question."
3. Do not invent or fabricate any information or citation references.
4. Reference specific evidence when making claims.
5. Be concise and factual.
6. If different pieces of evidence conflict, note the discrepancy."""


class RAGService:
    """Retrieval-Augmented Generation service.

    Combines knowledge retrieval with local LLM generation to
    produce grounded answers with citations.

    Args:
        retriever: KnowledgeRetriever for finding relevant chunks.
        model_provider: The local LLM provider (Gemma via llama.cpp).
        default_similarity_threshold: Fallback threshold if not provided.
    """

    def __init__(
        self,
        retriever: KnowledgeRetriever,
        model_provider: ModelProvider,
        *,
        default_similarity_threshold: float = 0.05,
        model_registry: Any = None,
    ) -> None:
        self._retriever = retriever
        self._provider = model_provider
        self._default_threshold = default_similarity_threshold
        self._registry = model_registry

    def query(
        self,
        query: str,
        top_k: int = 5,
        max_context_chars: int = _MAX_CONTEXT_CHARS,
        similarity_threshold: float | None = None,
    ) -> RAGResponse:
        """Execute a RAG query.

        Args:
            query: The user's question.
            top_k: Number of chunks to retrieve.
            max_context_chars: Maximum characters of evidence in prompt.
            similarity_threshold: Minimum similarity score to include a chunk.

        Returns:
            RAGResponse with answer, citations, timing, and observability metrics.
        """
        total_start = time.monotonic()
        threshold = (
            similarity_threshold
            if similarity_threshold is not None
            else self._default_threshold
        )

        # --- Step 1: Retrieve ---
        retrieval_start = time.monotonic()
        results, retrieval_time = self._retriever.retrieve(
            query=query,
            top_k=top_k,
            similarity_threshold=threshold,
        )

        # Classify evidence quality from retrieved results
        evidence_quality = classify_evidence(results, threshold)

        # --- Step 2: Build Context ---
        context_start = time.monotonic()
        evidence_blocks: list[str] = []
        total_chars = 0
        used_results = []

        for result in results:
            header = f"[Source: {result.filename}"
            if result.page_number is not None:
                header += f", Page {result.page_number}"
            if result.section:
                header += f", Section: {result.section}"
            header += "]"

            block = f"{header}\n{result.chunk.text}"

            if total_chars + len(block) > max_context_chars:
                break

            evidence_blocks.append(block)
            total_chars += len(block)
            used_results.append(result)

        context_time = (time.monotonic() - context_start) * 1000

        # --- Step 3: Build Prompt ---
        prompt = _build_rag_prompt(query, evidence_blocks, evidence_quality)

        # --- Step 4: Generate ---
        gen_start = time.monotonic()
        try:
            gen_request = GenerationRequest(
                prompt=prompt,
                max_tokens=1024,
                temperature=0.3,
                system_prompt=(
                    "You are a knowledge base assistant. Answer questions "
                    "using only the evidence provided. Be accurate, concise, "
                    "and honest about limitations. Never fabricate information "
                    "or citations."
                ),
            )
            provider_to_use = self._provider
            if not provider_to_use.is_available() and self._registry is not None:
                available = self._registry.get_available(preferred="local")
                if available is not None:
                    provider_to_use = available[1]

            try:
                response = provider_to_use.generate(gen_request)
            except Exception as gen_err:
                if self._registry is not None:
                    available = self._registry.get_available(preferred="local")
                    if available is not None and available[1] is not provider_to_use:
                        provider_to_use = available[1]
                        response = provider_to_use.generate(gen_request)
                    else:
                        raise gen_err
                else:
                    raise gen_err

            answer = response.text
            model_name = response.model_name
        except Exception as exc:
            logger.error("RAG generation failed: %s", exc)
            answer = f"Generation failed: {exc}"
            model_name = "error"

        gen_time = (time.monotonic() - gen_start) * 1000

        # --- Step 5: Citations ---
        citations = build_citations(used_results)

        total_time = (time.monotonic() - total_start) * 1000

        metrics = RAGMetrics(
            query=query,
            embedding_time_ms=0.0,
            vector_search_time_ms=round(retrieval_time, 2),
            candidates_count=len(results),
            returned_count=len(used_results),
            similarity_threshold=threshold,
            evidence_quality=evidence_quality,
            context_construction_time_ms=round(context_time, 2),
            generation_time_ms=round(gen_time, 2),
            total_time_ms=round(total_time, 2),
        )

        return RAGResponse(
            query=query,
            answer=answer,
            citations=citations,
            model_used=model_name,
            retrieval_count=len(used_results),
            retrieval_time_ms=round(retrieval_time, 2),
            generation_time_ms=round(gen_time, 2),
            total_time_ms=round(total_time, 2),
            evidence_sufficient=(evidence_quality != EvidenceQuality.NO_EVIDENCE),
            evidence_quality=evidence_quality,
            embedding_time_ms=0.0,
            context_construction_time_ms=round(context_time, 2),
            similarity_threshold=threshold,
            candidates_count=len(results),
            metrics=metrics,
        )
