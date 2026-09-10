"""
RAG (Retrieval-Augmented Generation) service.

Pipeline:
    query → retrieve top-k chunks → build context → call local Gemma →
    generate answer → return answer + citations

The prompt clearly instructs Gemma to:
- Answer only from supplied evidence
- Say when evidence is insufficient
- Not invent citations
- Distinguish retrieved evidence from inference
"""

from __future__ import annotations

import logging
import time

from app.knowledge.citations import build_citations
from app.knowledge.models import RAGResponse
from app.knowledge.retrieval import KnowledgeRetriever
from app.models.base import GenerationRequest, ModelProvider

logger = logging.getLogger(__name__)

# Maximum characters of evidence to include in the prompt
_MAX_CONTEXT_CHARS = 5000


def _build_rag_prompt(
    query: str,
    evidence_blocks: list[str],
    insufficient: bool = False,
) -> str:
    """Build the RAG prompt with evidence context.

    The prompt is structured to ground the model's answer in
    retrieved evidence only.
    """
    if insufficient or not evidence_blocks:
        return (
            f"The user asked: {query}\n\n"
            "No relevant evidence was found in the knowledge base. "
            "State that you do not have sufficient information to answer "
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
3. Do not invent or fabricate any information.
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
    """

    def __init__(
        self,
        retriever: KnowledgeRetriever,
        model_provider: ModelProvider,
    ) -> None:
        self._retriever = retriever
        self._provider = model_provider

    def query(
        self,
        query: str,
        top_k: int = 5,
        max_context_chars: int = _MAX_CONTEXT_CHARS,
    ) -> RAGResponse:
        """Execute a RAG query.

        Args:
            query: The user's question.
            top_k: Number of chunks to retrieve.
            max_context_chars: Maximum characters of evidence in prompt.

        Returns:
            RAGResponse with answer, citations, and timing.
        """
        total_start = time.monotonic()

        # --- Retrieve ---
        results, retrieval_time = self._retriever.retrieve(
            query=query, top_k=top_k
        )

        # --- Build context ---
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

        # Determine if evidence is sufficient
        insufficient = len(used_results) == 0

        # --- Build prompt ---
        prompt = _build_rag_prompt(query, evidence_blocks, insufficient)

        # --- Generate ---
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
            response = self._provider.generate(gen_request)
            answer = response.text
            model_name = response.model_name
        except Exception as exc:
            logger.error("RAG generation failed: %s", exc)
            answer = f"Generation failed: {exc}"
            model_name = "error"

        gen_time = (time.monotonic() - gen_start) * 1000

        # --- Citations ---
        citations = build_citations(used_results)

        total_time = (time.monotonic() - total_start) * 1000

        return RAGResponse(
            query=query,
            answer=answer,
            citations=citations,
            model_used=model_name,
            retrieval_count=len(used_results),
            retrieval_time_ms=round(retrieval_time, 2),
            generation_time_ms=round(gen_time, 2),
            total_time_ms=round(total_time, 2),
            evidence_sufficient=not insufficient,
        )
