"""Context building and deterministic source citation management for ResearchSphere RAG."""
import logging
import uuid
from typing import Any, Dict, List
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger(__name__)


class RAGSource(BaseModel):
    source_number: int
    paper_id: uuid.UUID
    paper_title: str
    chunk_id: uuid.UUID
    chunk_index: int
    section_name: str
    start_page: int
    end_page: int
    similarity_score: float
    text: str


class ContextBuildResult(BaseModel):
    context_text: str
    sources: List[RAGSource]
    max_similarity: float
    total_sources: int


class RAGContextBuilder:
    """Builds formatted evidence context blocks and deterministic source citations within token/char budget."""

    def __init__(self, max_context_chars: int | None = None) -> None:
        self.max_context_chars = (
            max_context_chars if max_context_chars is not None else settings.RAG_MAX_CONTEXT_CHARACTERS
        )

    def build_context(self, raw_chunks: List[Dict[str, Any]]) -> ContextBuildResult:
        """Sorts, numbers, budgets, and formats retrieved paper chunks into structured evidence."""
        if not raw_chunks:
            return ContextBuildResult(
                context_text="",
                sources=[],
                max_similarity=0.0,
                total_sources=0,
            )

        # Sort descending by similarity score
        sorted_chunks = sorted(raw_chunks, key=lambda x: x.get("score", 0.0), reverse=True)
        max_similarity = float(sorted_chunks[0].get("score", 0.0))

        sources: List[RAGSource] = []
        context_blocks: List[str] = []
        accumulated_chars = 0

        for idx, item in enumerate(sorted_chunks, start=1):
            chunk_text = (item.get("text") or "").strip()
            paper_title = item.get("paper_title") or "Research Paper"
            section_name = item.get("section_name") or "General"
            start_page = item.get("start_page", 1)
            end_page = item.get("end_page", start_page)
            score = float(item.get("score", 0.0))

            paper_id_val = item.get("paper_id")
            chunk_id_val = item.get("chunk_id")

            paper_id = (
                paper_id_val if isinstance(paper_id_val, uuid.UUID) else uuid.UUID(str(paper_id_val))
            )
            chunk_id = (
                chunk_id_val if isinstance(chunk_id_val, uuid.UUID) else uuid.UUID(str(chunk_id_val))
            )

            # Build formatted source block
            page_str = f"{start_page}–{end_page}" if start_page != end_page else f"{start_page}"
            block = (
                f"[SOURCE {idx}]\n"
                f"Paper: {paper_title}\n"
                f"Section: {section_name}\n"
                f"Pages: {page_str}\n"
                f"Chunk: {item.get('chunk_index', 0)}\n\n"
                f"{chunk_text}\n"
            )

            block_len = len(block)
            if accumulated_chars + block_len > self.max_context_chars and sources:
                logger.info(
                    "Context budget reached (%d chars). Skipping remaining %d chunks.",
                    accumulated_chars,
                    len(sorted_chunks) - len(sources),
                )
                break

            sources.append(
                RAGSource(
                    source_number=idx,
                    paper_id=paper_id,
                    paper_title=paper_title,
                    chunk_id=chunk_id,
                    chunk_index=item.get("chunk_index", 0),
                    section_name=section_name,
                    start_page=start_page,
                    end_page=end_page,
                    similarity_score=score,
                    text=chunk_text,
                )
            )
            context_blocks.append(block)
            accumulated_chars += block_len

        full_context = "\n---\n\n".join(context_blocks)
        return ContextBuildResult(
            context_text=full_context,
            sources=sources,
            max_similarity=max_similarity,
            total_sources=len(sources),
        )


context_builder = RAGContextBuilder()
