"""Structured Scientific Paper Summarization Service."""
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.paper import Paper
from app.models.paper_chunk import PaperChunk
from app.models.paper_summary import PaperSummary
from app.schemas.summary import (
    PaperSummaryResponse,
    StructuredSummary,
    SummaryCitation,
    SummarySection,
)
from app.services.embedding import embedding_service
from app.services.llm.service import llm_service
from app.services.qdrant_service import qdrant_service

logger = logging.getLogger(__name__)

NOT_STATED_MESSAGE = "Not clearly stated in the paper."

SUMMARY_CATEGORIES = [
    ("objective", "research objective problem statement goal motivation aims"),
    ("methodology", "methodology proposed approach system architecture algorithm implementation pipeline"),
    ("dataset_setup", "dataset experimental setup benchmark data collection hardware evaluation metrics environment"),
    ("key_findings", "key findings experimental results performance comparison accuracy evaluation outcomes"),
    ("limitations", "limitations threats to validity weaknesses constraints assumptions challenges"),
    ("future_work", "future work research directions future enhancements extensions open questions"),
]

SUMMARY_SYSTEM_INSTRUCTION = """You are ResearchSphere AI, an expert scientific research analyst.
Your purpose is to generate an evidence-grounded, structured summary of a research paper across 6 core scientific dimensions using ONLY the provided numbered [SOURCE] blocks.

DIMENSIONS TO SUMMARIZE:
1. objective: Research objective, problem statement, motivation, or core goal.
2. methodology: Proposed methodology, architecture, algorithm, pipeline, or approach.
3. dataset_setup: Dataset, benchmark, experimental setup, or training configuration.
4. key_findings: Key findings, empirical results, performance gains, or main outcomes.
5. limitations: Explicit limitations, weaknesses, constraints, assumptions, or boundary conditions.
6. future_work: Future work, open questions, potential extensions, or future directions.

GROUNDING & TRUTHFULNESS RULES:
1. STRICT ADHERENCE TO EVIDENCE: Every summary statement must be grounded solely in the provided [SOURCE] blocks. Do not extrapolate, assume, or use external knowledge.
2. MISSING EVIDENCE RULE: If the paper evidence does not clearly provide information for a dimension (for example, if no dataset or limitation is mentioned in the evidence), the "summary" string MUST be EXACTLY:
"Not clearly stated in the paper."
Do NOT invent or hallucinate missing information under any circumstances.
3. CITATION NUMBERS: For each dimension, include in "citations" the integer source numbers corresponding to the [SOURCE N] blocks that directly support the summary (e.g. [1, 2]). If a dimension is "Not clearly stated in the paper.", "citations" MUST be an empty list [].
4. CONCISE & OBJECTIVE: Keep each summary concise, factual, and written in clear scientific prose (1-3 sentences per dimension).
5. FORMAT: You MUST return a single valid JSON object strictly adhering to this structure:
{
  "objective": { "summary": "...", "citations": [1] },
  "methodology": { "summary": "...", "citations": [2, 3] },
  "dataset_setup": { "summary": "...", "citations": [4] },
  "key_findings": { "summary": "...", "citations": [5] },
  "limitations": { "summary": "Not clearly stated in the paper.", "citations": [] },
  "future_work": { "summary": "...", "citations": [6] }
}"""


class PaperSummaryError(Exception):
    """Base exception for summarization failures."""
    pass


class PaperPreconditionError(PaperSummaryError):
    """Raised when paper is not ready for summarization."""
    pass


class PaperSummaryService:
    """Service orchestrating evidence retrieval, LLM structured summarization, and persistence."""

    def get_summary(self, paper_id: uuid.UUID, user_id: uuid.UUID, db: Session) -> Optional[PaperSummaryResponse]:
        """Retrieve existing persisted summary for a paper with ownership check."""
        paper = db.query(Paper).filter(Paper.id == paper_id, Paper.user_id == user_id).first()
        if not paper:
            return None

        record = db.query(PaperSummary).filter(PaperSummary.paper_id == paper_id).first()
        if not record:
            return None

        structured = StructuredSummary.model_validate(record.summary_data)
        return PaperSummaryResponse(
            id=record.id,
            paper_id=record.paper_id,
            summary=structured,
            model_provider=record.model_provider,
            model_name=record.model_name,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    def generate_summary(
        self,
        paper_id: uuid.UUID,
        user_id: uuid.UUID,
        db: Session,
    ) -> PaperSummaryResponse:
        """Generate, validate, and persist a structured scientific summary for a paper."""
        # 1. Ownership & Precondition Checks
        paper = db.query(Paper).filter(Paper.id == paper_id, Paper.user_id == user_id).first()
        if not paper:
            raise PaperPreconditionError("Paper not found or unauthorized access.")

        if paper.chunking_status != "completed":
            raise PaperPreconditionError("Document chunking must be completed before generating a summary.")

        if paper.embedding_status != "completed":
            raise PaperPreconditionError("Semantic indexing must be completed before generating a summary.")

        # 2. Retrieve multi-dimensional evidence across paper chunks
        evidence_chunks = self._retrieve_evidence_chunks(paper=paper, user_id=user_id, db=db)
        if not evidence_chunks:
            raise PaperSummaryError("No extractable chunks found in paper to summarize.")

        # 3. Build structured evidence context
        context_text, source_map = self._build_evidence_context(paper=paper, chunks=evidence_chunks)

        # 4. Invoke LLM with Grounded Prompt
        user_prompt = (
            f"RESEARCH PAPER EVIDENCE:\n\n"
            f"{context_text}\n\n"
            f"Generate a truthful, grounded 6-dimensional scientific summary for '{paper.title}' "
            f"following the required JSON schema. Cite the relevant [SOURCE N] numbers for each dimension."
        )

        try:
            raw_response = llm_service.generate_grounded_answer(
                prompt=user_prompt,
                system_instruction=SUMMARY_SYSTEM_INSTRUCTION,
                temperature=0.1,
            )
        except Exception as exc:
            logger.error("LLM summarization call failed: %s", exc)
            raise PaperSummaryError(f"AI summarization service failed: {str(exc)}") from exc

        # 5. Parse and validate structured output
        structured_summary = self._parse_and_validate_response(
            raw_response=raw_response,
            source_map=source_map,
            paper_id=paper.id,
        )

        # 6. Persist to PostgreSQL (Create or Update existing)
        existing_summary = db.query(PaperSummary).filter(PaperSummary.paper_id == paper.id).first()
        provider_info = llm_service.get_status()
        model_provider = provider_info.get("provider", "groq")
        model_name = provider_info.get("model", settings.GROQ_MODEL)

        now = datetime.now(timezone.utc)
        if existing_summary:
            existing_summary.summary_data = structured_summary.model_dump(mode="json")
            existing_summary.model_provider = model_provider
            existing_summary.model_name = model_name
            existing_summary.updated_at = now
            record = existing_summary
        else:
            record = PaperSummary(
                paper_id=paper.id,
                summary_data=structured_summary.model_dump(mode="json"),
                model_provider=model_provider,
                model_name=model_name,
                created_at=now,
                updated_at=now,
            )
            db.add(record)

        db.commit()
        db.refresh(record)

        return PaperSummaryResponse(
            id=record.id,
            paper_id=record.paper_id,
            summary=structured_summary,
            model_provider=record.model_provider,
            model_name=record.model_name,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    def _retrieve_evidence_chunks(
        self,
        paper: Paper,
        user_id: uuid.UUID,
        db: Session,
    ) -> List[Dict[str, Any]]:
        """Collects evidence across the paper using targeted queries and section-aware heuristics."""
        collected_chunks: Dict[uuid.UUID, Dict[str, Any]] = {}

        # A. Targeted semantic queries for each dimension
        for dimension, query_text in SUMMARY_CATEGORIES:
            try:
                query_vector = embedding_service.embed_query(query_text)
                matches = qdrant_service.search(
                    query_vector=query_vector,
                    user_id=user_id,
                    paper_id=paper.id,
                    limit=3,
                )
                for item in matches:
                    cid_str = str(item.get("chunk_id"))
                    try:
                        cid = uuid.UUID(cid_str)
                    except (ValueError, TypeError):
                        continue
                    if cid not in collected_chunks:
                        collected_chunks[cid] = item
            except Exception as e:
                logger.warning("Targeted search for dimension '%s' failed: %s", dimension, e)

        # B. Section-aware fallback: Ensure Abstract/Intro and Limitation/Conclusion chunks are present
        db_chunks = db.query(PaperChunk).filter(PaperChunk.paper_id == paper.id).order_by(PaperChunk.chunk_index).all()
        for c in db_chunks:
            sec = (c.section_name or "").upper()
            is_priority_section = any(
                p in sec for p in ["ABSTRACT", "INTRODUCTION", "LIMITATION", "CONCLUSION", "FUTURE"]
            ) or c.chunk_index in [0, 1]

            if is_priority_section and c.id not in collected_chunks:
                collected_chunks[c.id] = {
                    "chunk_id": str(c.id),
                    "paper_id": str(paper.id),
                    "paper_title": paper.title,
                    "section_name": c.section_name or "General",
                    "start_page": c.start_page,
                    "end_page": c.end_page,
                    "chunk_index": c.chunk_index,
                    "text": c.text,
                    "score": 1.0 if is_priority_section else 0.5,
                }

        # If Qdrant had no results (e.g. during mock tests), fall back to DB chunks directly
        if not collected_chunks and db_chunks:
            for c in db_chunks[:10]:
                collected_chunks[c.id] = {
                    "chunk_id": str(c.id),
                    "paper_id": str(paper.id),
                    "paper_title": paper.title,
                    "section_name": c.section_name or "General",
                    "start_page": c.start_page,
                    "end_page": c.end_page,
                    "chunk_index": c.chunk_index,
                    "text": c.text,
                    "score": 1.0,
                }

        # Sort chunks sequentially by chunk_index to present a coherent narrative flow
        sorted_chunks = sorted(collected_chunks.values(), key=lambda x: x.get("chunk_index", 0))
        return sorted_chunks

    def _build_evidence_context(
        self,
        paper: Paper,
        chunks: List[Dict[str, Any]],
        max_chars: int = 14000,
    ) -> tuple[str, Dict[int, Dict[str, Any]]]:
        """Formats chunks into numbered [SOURCE N] blocks within token/character budget."""
        context_blocks: List[str] = []
        source_map: Dict[int, Dict[str, Any]] = {}
        accumulated_chars = 0

        for idx, item in enumerate(chunks, start=1):
            chunk_text = (item.get("text") or "").strip()
            section_name = item.get("section_name") or "General"
            start_page = item.get("start_page", 1)
            end_page = item.get("end_page", start_page)
            chunk_index = item.get("chunk_index", 0)

            page_str = f"{start_page}–{end_page}" if start_page != end_page else f"{start_page}"
            block = (
                f"[SOURCE {idx}]\n"
                f"Paper: {paper.title}\n"
                f"Section: {section_name}\n"
                f"Pages: {page_str}\n"
                f"Chunk: {chunk_index}\n\n"
                f"{chunk_text}\n"
            )

            if accumulated_chars + len(block) > max_chars and context_blocks:
                logger.info("Summary context budget reached at %d sources (%d chars).", idx - 1, accumulated_chars)
                break

            context_blocks.append(block)
            source_map[idx] = item
            accumulated_chars += len(block)

        return "\n".join(context_blocks), source_map

    def _parse_and_validate_response(
        self,
        raw_response: str,
        source_map: Dict[int, Dict[str, Any]],
        paper_id: uuid.UUID,
    ) -> StructuredSummary:
        """Parses LLM JSON output, validates structure, and maps source numbers to authoritative citations."""
        # 1. Clean markdown JSON code fences
        cleaned = raw_response.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

        # 2. Parse JSON
        parsed: Dict[str, Any] = {}
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.warning("Failed to parse raw JSON from LLM: %s. Raw was:\n%s", exc, raw_response[:300])
            # Attempt regex extraction if JSON was surrounded by prose
            json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if json_match:
                try:
                    parsed = json.loads(json_match.group(0))
                except json.JSONDecodeError:
                    pass

        if not isinstance(parsed, dict):
            parsed = {}

        dimensions = ["objective", "methodology", "dataset_setup", "key_findings", "limitations", "future_work"]
        validated_sections: Dict[str, SummarySection] = {}

        for dim in dimensions:
            dim_data = parsed.get(dim)
            if isinstance(dim_data, dict):
                summary_text = str(dim_data.get("summary") or "").strip()
                raw_citations = dim_data.get("citations", [])
            elif isinstance(dim_data, str):
                summary_text = dim_data.strip()
                raw_citations = []
            else:
                summary_text = NOT_STATED_MESSAGE
                raw_citations = []

            # Normalize missing evidence
            if not summary_text or any(
                summary_text.lower().startswith(p)
                for p in ["not clearly stated", "not stated", "not mentioned", "not provided", "n/a", "none"]
            ):
                summary_text = NOT_STATED_MESSAGE
                citations: List[SummaryCitation] = []
            else:
                # Validate citation numbers against authoritative source_map
                citations = []
                seen_sources = set()
                if isinstance(raw_citations, list):
                    for src_val in raw_citations:
                        # Extract integer if formatted like "1", "[1]", or 1
                        try:
                            if isinstance(src_val, int):
                                src_num = src_val
                            else:
                                m = re.search(r"\d+", str(src_val))
                                src_num = int(m.group(0)) if m else None
                        except (ValueError, TypeError):
                            src_num = None

                        if src_num is not None and src_num in source_map and src_num not in seen_sources:
                            seen_sources.add(src_num)
                            src_chunk = source_map[src_num]
                            cid_val = src_chunk.get("chunk_id")
                            cid = cid_val if isinstance(cid_val, uuid.UUID) else uuid.UUID(str(cid_val))

                            citations.append(
                                SummaryCitation(
                                    source_number=src_num,
                                    paper_id=paper_id,
                                    chunk_id=cid,
                                    chunk_index=int(src_chunk.get("chunk_index", 0)),
                                    section_name=str(src_chunk.get("section_name", "General")),
                                    start_page=int(src_chunk.get("start_page", 1)),
                                    end_page=int(src_chunk.get("end_page", 1)),
                                )
                            )

            validated_sections[dim] = SummarySection(
                summary=summary_text,
                citations=citations,
            )

        return StructuredSummary(**validated_sections)


paper_summary_service = PaperSummaryService()
