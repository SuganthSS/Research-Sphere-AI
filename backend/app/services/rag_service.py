"""Grounded scientific question answering orchestrator."""
import logging
import re
from typing import Any, Dict, List
from pydantic import BaseModel

from app.core.config import settings
from app.services.context_builder import context_builder, RAGSource
from app.services.llm.service import llm_service

logger = logging.getLogger(__name__)

GROUNDING_SYSTEM_INSTRUCTION = """You are ResearchSphere AI, a scientific research assistant.
Your sole purpose is to provide truthful, grounded answers to researchers based strictly on the provided research paper sources.

CRITICAL GROUNDING RULES:
1. ONLY USE PROVIDED EVIDENCE: Base every statement and claim ONLY on the provided [SOURCE] blocks. Do NOT extrapolate or use outside knowledge.
2. INSUFFICIENT EVIDENCE: If the provided sources do not contain sufficient evidence to answer the user's question, you MUST respond with:
"I couldn't find sufficient evidence in the selected research papers to answer this question."
Do NOT attempt to invent, guess, or fabricate an answer.
3. PRESERVE CITATIONS: Cite every claim using bracketed source numbers corresponding to the sources provided, e.g. [1], [2], or [1][2].
4. ACCURATE CITATION LABELS: Only cite source numbers that actually exist in the evidence. Never invent source numbers.
5. CONCISE & OBJECTIVE: Maintain an academic, precise, objective, and neutral tone. State findings clearly with their supporting citations."""

INSUFFICIENT_EVIDENCE_ANSWER = (
    "I couldn't find sufficient evidence in the selected research papers to answer this question."
)


class RAGAnswerResult(BaseModel):
    answer: str
    sources: List[RAGSource]
    total_sources: int
    insufficient_evidence: bool = False


class RAGService:
    """Orchestrates retrieval context formatting, LLM inference, and citation validation."""

    def answer_question(
        self,
        question: str,
        retrieved_chunks: List[Dict[str, Any]],
        similarity_threshold: float = settings.RAG_SIMILARITY_THRESHOLD,
    ) -> RAGAnswerResult:
        """Produces a grounded research answer from retrieved paper chunks."""
        # 1. Build structured evidence context
        context_result = context_builder.build_context(retrieved_chunks)

        # 2. Check if retrieval produced 0 sources or if similarity is below threshold
        if context_result.total_sources == 0:
            logger.info("No chunks retrieved for question: '%s'", question[:60])
            return RAGAnswerResult(
                answer=INSUFFICIENT_EVIDENCE_ANSWER,
                sources=[],
                total_sources=0,
                insufficient_evidence=True,
            )

        if context_result.max_similarity < similarity_threshold:
            logger.info(
                "Max similarity %.4f is below threshold %.4f for question: '%s'",
                context_result.max_similarity,
                similarity_threshold,
                question[:60],
            )
            return RAGAnswerResult(
                answer=INSUFFICIENT_EVIDENCE_ANSWER,
                sources=[],
                total_sources=0,
                insufficient_evidence=True,
            )

        # 3. Assemble prompt
        prompt = (
            f"RESEARCH EVIDENCE:\n"
            f"{context_result.context_text}\n\n"
            f"QUESTION:\n"
            f"{question}\n\n"
            f"Provide a grounded, comprehensive answer citing the relevant [SOURCE] numbers:"
        )

        # 4. Generate answer via LLM service
        raw_answer = llm_service.generate_grounded_answer(
            prompt=prompt,
            system_instruction=GROUNDING_SYSTEM_INSTRUCTION,
            temperature=0.1,
        )

        # 5. Check if LLM itself declared insufficient evidence
        if (
            INSUFFICIENT_EVIDENCE_ANSWER.lower() in raw_answer.lower()
            or "insufficient evidence" in raw_answer.lower()
        ):
            return RAGAnswerResult(
                answer=raw_answer,
                sources=context_result.sources,
                total_sources=context_result.total_sources,
                insufficient_evidence=True,
            )

        # 6. Validate citation numbers: strip invalid citation tags (e.g. [7] when only 3 sources exist)
        validated_answer = self._validate_citations(
            answer_text=raw_answer,
            max_valid_source=context_result.total_sources,
        )

        return RAGAnswerResult(
            answer=validated_answer,
            sources=context_result.sources,
            total_sources=context_result.total_sources,
            insufficient_evidence=False,
        )

    def _validate_citations(self, answer_text: str, max_valid_source: int) -> str:
        """Removes or normalizes hallucinated citations that exceed available sources."""
        def repl(match: re.Match) -> str:
            val = int(match.group(1))
            if 1 <= val <= max_valid_source:
                return match.group(0)  # Keep valid citation
            # Invalid citation beyond source count; remove it
            return ""

        return re.sub(r"\[(\d+)\]", repl, answer_text)


rag_service = RAGService()
