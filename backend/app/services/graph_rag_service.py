"""Hybrid GraphRAG orchestration service combining vector retrieval with Neo4j knowledge graphs."""
import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.context_builder import context_builder, RAGSource
from app.services.llm.service import llm_service
from app.services.neo4j_service import neo4j_service
from app.services.rag_service import (
    INSUFFICIENT_EVIDENCE_ANSWER,
    rag_service,
)

logger = logging.getLogger(__name__)

HYBRID_SYSTEM_INSTRUCTION = """You are ResearchSphere AI, a scientific research assistant equipped with Hybrid GraphRAG (semantic vector evidence + scientific knowledge graph).
Your purpose is to provide truthful, comprehensive, grounded answers to researchers.

CRITICAL GROUNDING & HYBRID CITATION RULES:
1. CITATIONS FROM PAPER CHUNKS ONLY: Base factual scientific claims on the provided [SOURCE] blocks. Cite claims using bracketed source numbers like [1], [2].
2. GRAPH CONTEXT: Use the GRAPH CONTEXT section to enrich your understanding of relationships, methods, research topics, datasets, and author connections. Do NOT cite graph relationships as source numbers (never cite [GRAPH] or fabricate [SOURCE N] for graph items that do not exist in the vector evidence).
3. INSUFFICIENT EVIDENCE: If neither the vector evidence nor the graph context provides sufficient evidence to answer the question, you MUST respond with:
"I couldn't find sufficient evidence in the selected research papers to answer this question."
Do NOT attempt to invent, guess, or fabricate an answer.
4. ACCURATE CITATION LABELS: Only cite source numbers that actually exist in the [SOURCE] evidence. Never invent source numbers.
5. CONCISE & OBJECTIVE: Maintain an academic, precise, objective, and neutral tone."""


class GraphRAGAnswerResult(BaseModel):
    answer: str
    sources: List[RAGSource]
    total_sources: int
    insufficient_evidence: bool = False
    retrieval_mode: str = "graph"
    graph_context_used: bool = False
    graph_entities: List[str] = Field(default_factory=list)
    graph_relationships: List[str] = Field(default_factory=list)
    graph_fallback: bool = False
    graph_fallback_reason: Optional[str] = None


class GraphRAGService:
    """Combines semantic vector chunks and Neo4j graph subgraphs into a unified grounded context."""

    def answer_question(
        self,
        question: str,
        retrieved_chunks: List[Dict[str, Any]],
        allowed_paper_ids: List[str],
        similarity_threshold: float = settings.RAG_SIMILARITY_THRESHOLD,
    ) -> GraphRAGAnswerResult:
        """Executes Hybrid GraphRAG by fusing vector retrieval and Neo4j 1-2 hop relationships."""
        # 1. Build vector evidence context
        context_result = context_builder.build_context(retrieved_chunks)

        # 2. Check vector evidence preconditions
        if context_result.total_sources == 0:
            logger.info("No vector chunks retrieved for question: '%s'", question[:60])
            return GraphRAGAnswerResult(
                answer=INSUFFICIENT_EVIDENCE_ANSWER,
                sources=[],
                total_sources=0,
                insufficient_evidence=True,
                retrieval_mode="graph",
                graph_context_used=False,
            )

        if context_result.max_similarity < similarity_threshold:
            logger.info(
                "Max similarity %.4f is below threshold %.4f for question: '%s'",
                context_result.max_similarity,
                similarity_threshold,
                question[:60],
            )
            return GraphRAGAnswerResult(
                answer=INSUFFICIENT_EVIDENCE_ANSWER,
                sources=[],
                total_sources=0,
                insufficient_evidence=True,
                retrieval_mode="graph",
                graph_context_used=False,
            )

        # 3. Retrieve Graph Context from Neo4j with safe fallback
        graph_entities: List[str] = []
        graph_relationships: List[str] = []
        graph_context_used = False
        graph_fallback = False
        graph_fallback_reason: Optional[str] = None
        graph_text = ""

        try:
            if not neo4j_service.is_available():
                graph_fallback = True
                graph_fallback_reason = "Neo4j graph database unavailable."
                logger.info("Neo4j is not connected. Gracefully falling back to vector RAG.")
            else:
                graph_data = neo4j_service.get_graph_context(
                    paper_ids=allowed_paper_ids,
                    max_relationships=30,
                )
                graph_entities = graph_data.get("entities", [])
                graph_relationships = graph_data.get("relationships", [])
                graph_text = graph_data.get("context_text", "").strip()
                if graph_relationships:
                    graph_context_used = True
        except Exception as exc:
            logger.warning("Graph retrieval failed, falling back to standard RAG: %s", exc)
            graph_fallback = True
            graph_fallback_reason = f"Graph retrieval error: {str(exc)}"

        # 4. Construct Hybrid Prompt
        prompt_sections = [
            f"VECTOR EVIDENCE:\n{context_result.context_text}",
        ]
        if graph_context_used and graph_text:
            prompt_sections.append(f"GRAPH CONTEXT:\n{graph_text}")

        prompt_sections.append(
            f"QUESTION:\n{question}\n\n"
            f"Provide a grounded, comprehensive answer citing the relevant [SOURCE] numbers for factual claims:"
        )
        full_prompt = "\n\n".join(prompt_sections)

        # 5. Generate Answer via LLM
        system_instruction = (
            HYBRID_SYSTEM_INSTRUCTION if graph_context_used else HYBRID_SYSTEM_INSTRUCTION
        )
        raw_answer = llm_service.generate_grounded_answer(
            prompt=full_prompt,
            system_instruction=system_instruction,
            temperature=0.1,
        )

        # 6. Check if LLM declared insufficient evidence
        if (
            INSUFFICIENT_EVIDENCE_ANSWER.lower() in raw_answer.lower()
            or "insufficient evidence" in raw_answer.lower()
        ):
            return GraphRAGAnswerResult(
                answer=raw_answer,
                sources=context_result.sources,
                total_sources=context_result.total_sources,
                insufficient_evidence=True,
                retrieval_mode="graph",
                graph_context_used=graph_context_used,
                graph_entities=graph_entities,
                graph_relationships=graph_relationships,
                graph_fallback=graph_fallback,
                graph_fallback_reason=graph_fallback_reason,
            )

        # 7. Validate citations: strictly preserve only valid [1]..[N] from vector chunks
        validated_answer = rag_service._validate_citations(
            answer_text=raw_answer,
            max_valid_source=context_result.total_sources,
        )

        return GraphRAGAnswerResult(
            answer=validated_answer,
            sources=context_result.sources,
            total_sources=context_result.total_sources,
            insufficient_evidence=False,
            retrieval_mode="graph",
            graph_context_used=graph_context_used,
            graph_entities=graph_entities,
            graph_relationships=graph_relationships,
            graph_fallback=graph_fallback,
            graph_fallback_reason=graph_fallback_reason,
        )


graph_rag_service = GraphRAGService()
