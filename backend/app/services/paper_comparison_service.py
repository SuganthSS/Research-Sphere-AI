"""Structured Multi-Paper Comparison Service."""
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.paper import Paper
from app.models.paper_chunk import PaperChunk
from app.models.paper_summary import PaperSummary
from app.models.paper_comparison import PaperComparison
from app.schemas.comparison import (
    ComparePapersRequest,
    ComparisonCitation,
    ComparisonDimensionRow,
    PaperComparisonResponse,
    PaperDimensionSummary,
    PaperMetadataBrief,
    StructuredComparison,
    SynthesisItem,
)
from app.services.embedding import embedding_service
from app.services.llm.service import llm_service
from app.services.paper_summary_service import (
    NOT_STATED_MESSAGE,
    paper_summary_service,
)

logger = logging.getLogger(__name__)

COMPARISON_DIMENSIONS: List[Tuple[str, str]] = [
    ("objective", "Research Objective / Problem"),
    ("methodology", "Methodology / Approach"),
    ("dataset_setup", "Dataset & Experimental Setup"),
    ("key_findings", "Key Findings & Results"),
    ("limitations", "Limitations & Constraints"),
    ("future_work", "Future Work & Research Directions"),
]

COMPARISON_SYSTEM_INSTRUCTION = """You are ResearchSphere AI, an expert scientific research comparative analyst.
Your purpose is to generate an evidence-grounded comparative analysis contrasting 2 to 5 scientific research papers using ONLY the provided numbered [SOURCE] blocks.

COMPARISON DIMENSIONS:
1. objective: Research objective, problem statement, or motivation.
2. methodology: Proposed methodology, architecture, algorithm, or approach.
3. dataset_setup: Dataset, benchmark, experimental setup, or training configuration.
4. key_findings: Key findings, empirical results, performance gains, or main outcomes.
5. limitations: Explicit limitations, weaknesses, constraints, assumptions, or boundary conditions.
6. future_work: Future work, open questions, potential extensions, or future directions.

SYNTHESIS SECTIONS:
- similarities: Major methodological, thematic, architectural, or empirical similarities shared across the papers.
- differences: Major points of divergence, contrasting approaches, trade-offs, or different experimental choices.

GROUNDING & TRUTHFULNESS RULES:
1. STRICT ADHERENCE TO EVIDENCE: Every statement must be grounded solely in the provided [SOURCE] blocks. Do not extrapolate, assume, or use external knowledge.
2. STRICT PAPER ATTRIBUTION: Each paper's dimension summary MUST cite ONLY [SOURCE N] blocks belonging to that specific paper. Never attribute Paper A's evidence to Paper B.
3. MISSING EVIDENCE RULE: If a paper does not clearly state evidence for a dimension, the "summary" string MUST be EXACTLY:
"Not clearly stated in the paper."
and "citations" MUST be an empty list []. Do NOT invent or hallucinate missing information.
4. SYNTHESIS CITATIONS: In "similarities" and "differences", identify which papers support the claim in "paper_ids" (use the paper UUID string) and cite the relevant [SOURCE N] numbers in "citations".
5. CONCISENESS & COMPLETENESS: Write concise summaries (1-2 sentences per paper per dimension). Keep synthesis concise (1-2 sentences). Provide at most 2 items each in "similarities" and "differences" so the JSON completes within token budget.
6. FORMAT: You MUST return a single valid JSON object strictly adhering to this structure:
{
  "dimensions": {
    "objective": {
      "synthesis": "Brief 1-2 sentence comparative synthesis",
      "papers": {
        "<paper_id_1>": { "summary": "...", "citations": [1] },
        "<paper_id_2>": { "summary": "...", "citations": [4] }
      }
    },
    "methodology": { ... },
    "dataset_setup": { ... },
    "key_findings": { ... },
    "limitations": { ... },
    "future_work": { ... }
  },
  "similarities": [
    {
      "title": "Short descriptive title",
      "description": "Evidence-grounded description of the similarity",
      "paper_ids": ["<paper_id_1>", "<paper_id_2>"],
      "citations": [1, 4]
    }
  ],
  "differences": [
    {
      "title": "Short descriptive title",
      "description": "Evidence-grounded description of the difference",
      "paper_ids": ["<paper_id_1>", "<paper_id_2>"],
      "citations": [2, 5]
    }
  ]
}"""


class PaperComparisonError(Exception):
    """Base exception for comparison failures."""
    pass


class PaperComparisonPreconditionError(PaperComparisonError):
    """Raised when papers are not ready, unowned, or count is invalid."""
    pass


class PaperComparisonService:
    """Service orchestrating multi-paper evidence retrieval, LLM comparative analysis, and persistence."""

    def make_paper_ids_key(self, paper_ids: List[uuid.UUID]) -> str:
        """Deterministic sorted string key for a set of paper IDs."""
        return ",".join(sorted(str(pid).lower() for pid in paper_ids))

    def get_comparison(
        self,
        user_id: uuid.UUID,
        paper_ids: List[uuid.UUID],
        db: Session,
    ) -> Optional[PaperComparisonResponse]:
        """Retrieve existing persisted comparison for a user and specific set of papers."""
        key = self.make_paper_ids_key(paper_ids)
        record = (
            db.query(PaperComparison)
            .filter(
                PaperComparison.user_id == user_id,
                PaperComparison.paper_ids_key == key,
            )
            .first()
        )
        if not record:
            return None

        structured = StructuredComparison.model_validate(record.comparison_data)
        return PaperComparisonResponse(
            id=record.id,
            user_id=record.user_id,
            paper_ids=[uuid.UUID(pid) for pid in record.paper_ids],
            comparison=structured,
            model_provider=record.model_provider,
            model_name=record.model_name,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    def get_comparison_by_id(
        self,
        user_id: uuid.UUID,
        comparison_id: uuid.UUID,
        db: Session,
    ) -> Optional[PaperComparisonResponse]:
        """Retrieve existing comparison by ID with ownership check."""
        record = (
            db.query(PaperComparison)
            .filter(
                PaperComparison.id == comparison_id,
                PaperComparison.user_id == user_id,
            )
            .first()
        )
        if not record:
            return None

        structured = StructuredComparison.model_validate(record.comparison_data)
        return PaperComparisonResponse(
            id=record.id,
            user_id=record.user_id,
            paper_ids=[uuid.UUID(pid) for pid in record.paper_ids],
            comparison=structured,
            model_provider=record.model_provider,
            model_name=record.model_name,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    def compare_papers(
        self,
        user_id: uuid.UUID,
        paper_ids: List[uuid.UUID],
        db: Session,
    ) -> PaperComparisonResponse:
        """Generate, validate, and persist an evidence-grounded comparison across 2-5 papers."""
        # 1. Count validation
        unique_ids = list(dict.fromkeys(paper_ids))
        if len(unique_ids) < 2:
            raise PaperComparisonPreconditionError("At least 2 unique research papers must be selected for comparison.")
        if len(unique_ids) > 5:
            raise PaperComparisonPreconditionError("A maximum of 5 research papers can be compared at once.")

        # 2. Ownership & existence validation
        papers: List[Paper] = []
        for pid in unique_ids:
            paper = db.query(Paper).filter(Paper.id == pid, Paper.user_id == user_id).first()
            if not paper:
                raise PaperComparisonPreconditionError(
                    f"Paper with ID '{pid}' was not found or unauthorized access."
                )

            # Precondition validation
            if paper.chunking_status != "completed":
                raise PaperComparisonPreconditionError(
                    f"Paper '{paper.title}' has not completed document chunking. Chunking status: '{paper.chunking_status}'."
                )
            if paper.embedding_status != "completed":
                raise PaperComparisonPreconditionError(
                    f"Paper '{paper.title}' has not completed semantic indexing. Embedding status: '{paper.embedding_status}'."
                )
            papers.append(paper)

        # 3. Collect evidence per paper
        context_parts: List[str] = []
        source_map: Dict[int, Dict[str, Any]] = {}
        paper_source_map: Dict[uuid.UUID, List[int]] = {p.id: [] for p in papers}
        current_source_idx = 1

        for p_idx, paper in enumerate(papers, 1):
            evidence_chunks = self._collect_paper_evidence(paper=paper, user_id=user_id, db=db)
            if not evidence_chunks:
                raise PaperComparisonError(f"No extractable chunks found for paper '{paper.title}'.")

            context_parts.append(
                f"=== PAPER {p_idx}: \"{paper.title}\" (ID: {paper.id}) ==="
            )

            for chunk_data in evidence_chunks:
                src_num = current_source_idx
                current_source_idx += 1

                cid = uuid.UUID(str(chunk_data["chunk_id"]))
                source_map[src_num] = {
                    "source_number": src_num,
                    "paper_id": paper.id,
                    "chunk_id": cid,
                    "chunk_index": int(chunk_data.get("chunk_index", 0)),
                    "section_name": str(chunk_data.get("section_name", "General")),
                    "start_page": int(chunk_data.get("start_page", 1)),
                    "end_page": int(chunk_data.get("end_page", 1)),
                }
                paper_source_map[paper.id].append(src_num)

                context_parts.append(
                    f"[SOURCE {src_num}] (Section: {chunk_data.get('section_name', 'General')}, "
                    f"Pages: {chunk_data.get('start_page', 1)}–{chunk_data.get('end_page', 1)}):\n"
                    f"{chunk_data.get('text', '').strip()}"
                )

            context_parts.append("")  # Empty line separation

        full_context = "\n\n".join(context_parts)

        # 4. Invoke LLM with Grounded Comparison Prompt
        user_prompt = (
            f"RESEARCH PAPERS EVIDENCE:\n\n"
            f"{full_context}\n\n"
            f"Compare the {len(papers)} papers across all 6 core scientific dimensions and synthesize their "
            f"major similarities and differences following the required JSON schema. Cite the relevant [SOURCE N] numbers.\n"
            f"CRITICAL REQUIREMENT: For each paper and dimension, write EXACTLY 1 concise sentence (maximum 15 words). "
            f"Synthesis must be 1 concise sentence (maximum 15 words). Give 1 similarity and 1 difference only. "
            f"The entire JSON must be complete and concise (under 800 tokens)."
        )

        try:
            raw_response = llm_service.generate_grounded_answer(
                prompt=user_prompt,
                system_instruction=COMPARISON_SYSTEM_INSTRUCTION,
                temperature=0.1,
                max_tokens=900,
            )
        except Exception as exc:
            logger.error("LLM comparison call failed: %s", exc)
            raise PaperComparisonError(f"AI comparison service failed: {str(exc)}") from exc

        # 5. Parse and Authoritatively Validate Output
        structured_comparison = self._parse_and_validate_response(
            raw_response=raw_response,
            papers=papers,
            source_map=source_map,
            paper_source_map=paper_source_map,
        )

        # 6. Persist to PostgreSQL (Create or Update existing)
        key = self.make_paper_ids_key(unique_ids)
        existing = (
            db.query(PaperComparison)
            .filter(
                PaperComparison.user_id == user_id,
                PaperComparison.paper_ids_key == key,
            )
            .first()
        )

        provider_info = llm_service.get_status()
        model_provider = provider_info.get("provider", "groq")
        model_name = provider_info.get("model", settings.GROQ_MODEL)

        now = datetime.now(timezone.utc)
        paper_id_strings = [str(p.id) for p in papers]

        if existing:
            existing.comparison_data = structured_comparison.model_dump(mode="json")
            existing.paper_ids = paper_id_strings
            existing.model_provider = model_provider
            existing.model_name = model_name
            existing.updated_at = now
            record = existing
        else:
            record = PaperComparison(
                user_id=user_id,
                paper_ids_key=key,
                paper_ids=paper_id_strings,
                comparison_data=structured_comparison.model_dump(mode="json"),
                model_provider=model_provider,
                model_name=model_name,
                created_at=now,
                updated_at=now,
            )
            db.add(record)

        db.commit()
        db.refresh(record)

        return PaperComparisonResponse(
            id=record.id,
            user_id=record.user_id,
            paper_ids=[uuid.UUID(pid) for pid in record.paper_ids],
            comparison=structured_comparison,
            model_provider=record.model_provider,
            model_name=record.model_name,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    def _collect_paper_evidence(
        self,
        paper: Paper,
        user_id: uuid.UUID,
        db: Session,
    ) -> List[Dict[str, Any]]:
        """Collects evidence chunks for a paper, prioritizing existing summary citations or section retrieval."""
        summary_record = db.query(PaperSummary).filter(PaperSummary.paper_id == paper.id).first()
        if summary_record and summary_record.summary_data:
            # Paper already has a structured summary. Extract its cited chunk IDs first
            cited_chunk_ids: List[uuid.UUID] = []
            try:
                for dim_data in summary_record.summary_data.values():
                    if isinstance(dim_data, dict):
                        for cite in dim_data.get("citations", []):
                            if "chunk_id" in cite:
                                cited_chunk_ids.append(uuid.UUID(str(cite["chunk_id"])))
            except Exception:
                cited_chunk_ids = []

            if cited_chunk_ids:
                unique_cids = list(dict.fromkeys(cited_chunk_ids))
                chunks = db.query(PaperChunk).filter(PaperChunk.id.in_(unique_cids)).order_by(PaperChunk.chunk_index.asc()).all()
                if chunks:
                    return [
                        {
                            "chunk_id": str(c.id),
                            "chunk_index": c.chunk_index,
                            "section_name": c.section_name or "General",
                            "start_page": c.start_page,
                            "end_page": c.end_page,
                            "text": c.text,
                        }
                        for c in chunks
                    ]

        # Fall back to multi-dimensional retrieval if summary is missing or lacked chunk IDs
        return paper_summary_service._retrieve_evidence_chunks(paper=paper, user_id=user_id, db=db)

    def _parse_and_validate_response(
        self,
        raw_response: str,
        papers: List[Paper],
        source_map: Dict[int, Dict[str, Any]],
        paper_source_map: Dict[uuid.UUID, List[int]],
    ) -> StructuredComparison:
        """Parses LLM JSON response and enforces strict 6-dimensional schema and citation attribution."""
        cleaned = raw_response.strip()
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, re.IGNORECASE)
        if match:
            cleaned = match.group(1).strip()

        try:
            data = json.loads(cleaned)
        except Exception:
            logger.warning("Could not parse LLM comparison JSON directly. Attempting robust repair.")
            data = None
            first_brace = cleaned.find("{")
            if first_brace != -1:
                candidate = cleaned[first_brace:]
                # Scan backwards from end to repair any cut-off JSON
                for i in range(len(candidate), max(0, len(candidate) - 1000), -5):
                    sub = candidate[:i].rstrip()
                    if not sub:
                        continue
                    if sub.endswith(",") or sub.endswith(":"):
                        sub = sub[:-1].rstrip()
                    opens_curly = sub.count("{") - sub.count("}")
                    opens_square = sub.count("[") - sub.count("]")
                    if opens_curly >= 0 and opens_square >= 0:
                        trial = sub + ("]" * opens_square) + ("}" * opens_curly)
                        try:
                            parsed_trial = json.loads(trial)
                            if isinstance(parsed_trial, dict) and "dimensions" in parsed_trial:
                                data = parsed_trial
                                logger.info("Successfully repaired JSON comparison response.")
                                break
                        except Exception:
                            continue
            if not isinstance(data, dict):
                data = {}

        raw_dimensions = data.get("dimensions", {}) if isinstance(data, dict) else {}
        paper_map = {str(p.id): p for p in papers}
        validated_dimensions: Dict[str, ComparisonDimensionRow] = {}

        # 1. Enforce all 6 dimensions
        for dim_key, dim_label in COMPARISON_DIMENSIONS:
            raw_dim_entry = raw_dimensions.get(dim_key, {})
            if not isinstance(raw_dim_entry, dict):
                raw_dim_entry = {}

            dim_synthesis = raw_dim_entry.get("synthesis")
            raw_papers_dict = raw_dim_entry.get("papers", {})
            if not isinstance(raw_papers_dict, dict):
                raw_papers_dict = {}

            validated_papers: Dict[str, PaperDimensionSummary] = {}

            for paper in papers:
                p_str = str(paper.id)
                p_entry = raw_papers_dict.get(p_str, {})
                if not isinstance(p_entry, dict) or not p_entry:
                    p_idx = str(papers.index(paper) + 1)
                    if p_idx in raw_papers_dict and isinstance(raw_papers_dict[p_idx], dict):
                        p_entry = raw_papers_dict[p_idx]
                    else:
                        for k, v in raw_papers_dict.items():
                            if isinstance(v, dict):
                                if k.lower() in paper.title.lower() or paper.title.lower() in k.lower() or p_str.startswith(k.lower()):
                                    p_entry = v
                                    break

                summary_text = (p_entry.get("summary") if p_entry else None) or NOT_STATED_MESSAGE
                summary_text = summary_text.strip()
                if not summary_text:
                    summary_text = NOT_STATED_MESSAGE

                citations: List[ComparisonCitation] = []
                allowed_sources = set(paper_source_map.get(paper.id, []))

                if summary_text != NOT_STATED_MESSAGE and p_entry:
                    raw_cites = p_entry.get("citations", [])
                    if isinstance(raw_cites, list):
                        for c in raw_cites:
                            src_num = None
                            if isinstance(c, int):
                                src_num = c
                            elif isinstance(c, dict) and "source_number" in c:
                                try:
                                    src_num = int(c["source_number"])
                                except Exception:
                                    pass

                            # Citation must exist and MUST belong to this paper
                            if src_num and src_num in allowed_sources and src_num in source_map:
                                src_info = source_map[src_num]
                                citations.append(
                                    ComparisonCitation(
                                        source_number=src_num,
                                        paper_id=paper.id,
                                        chunk_id=src_info["chunk_id"],
                                        chunk_index=src_info["chunk_index"],
                                        section_name=src_info["section_name"],
                                        start_page=src_info["start_page"],
                                        end_page=src_info["end_page"],
                                    )
                                )

                # Strip citations if summary says not clearly stated
                if summary_text == NOT_STATED_MESSAGE:
                    citations = []

                validated_papers[p_str] = PaperDimensionSummary(
                    paper_id=paper.id,
                    paper_title=paper.title,
                    summary=summary_text,
                    citations=citations,
                )

            validated_dimensions[dim_key] = ComparisonDimensionRow(
                dimension=dim_key,
                label=dim_label,
                papers=validated_papers,
                synthesis=dim_synthesis,
            )

        # 2. Similarities
        raw_similarities = data.get("similarities", []) if isinstance(data, dict) else []
        validated_similarities: List[SynthesisItem] = []
        if isinstance(raw_similarities, list):
            for item in raw_similarities:
                if isinstance(item, dict):
                    title = str(item.get("title", "")).strip()
                    desc = str(item.get("description", "")).strip()
                    if title and desc:
                        item_pids: List[uuid.UUID] = []
                        for pid_raw in item.get("paper_ids", []):
                            try:
                                pid = uuid.UUID(str(pid_raw))
                                if pid in [p.id for p in papers]:
                                    item_pids.append(pid)
                            except Exception:
                                pass

                        item_cites: List[ComparisonCitation] = []
                        for c in item.get("citations", []):
                            src_num = c if isinstance(c, int) else (c.get("source_number") if isinstance(c, dict) else None)
                            if src_num and src_num in source_map:
                                src_info = source_map[src_num]
                                item_cites.append(
                                    ComparisonCitation(
                                        source_number=src_num,
                                        paper_id=src_info["paper_id"],
                                        chunk_id=src_info["chunk_id"],
                                        chunk_index=src_info["chunk_index"],
                                        section_name=src_info["section_name"],
                                        start_page=src_info["start_page"],
                                        end_page=src_info["end_page"],
                                    )
                                )

                        validated_similarities.append(
                            SynthesisItem(
                                title=title,
                                description=desc,
                                paper_ids=item_pids or [p.id for p in papers],
                                citations=item_cites,
                            )
                        )

        # 3. Differences
        raw_differences = data.get("differences", []) if isinstance(data, dict) else []
        validated_differences: List[SynthesisItem] = []
        if isinstance(raw_differences, list):
            for item in raw_differences:
                if isinstance(item, dict):
                    title = str(item.get("title", "")).strip()
                    desc = str(item.get("description", "")).strip()
                    if title and desc:
                        item_pids: List[uuid.UUID] = []
                        for pid_raw in item.get("paper_ids", []):
                            try:
                                pid = uuid.UUID(str(pid_raw))
                                if pid in [p.id for p in papers]:
                                    item_pids.append(pid)
                            except Exception:
                                pass

                        item_cites: List[ComparisonCitation] = []
                        for c in item.get("citations", []):
                            src_num = c if isinstance(c, int) else (c.get("source_number") if isinstance(c, dict) else None)
                            if src_num and src_num in source_map:
                                src_info = source_map[src_num]
                                item_cites.append(
                                    ComparisonCitation(
                                        source_number=src_num,
                                        paper_id=src_info["paper_id"],
                                        chunk_id=src_info["chunk_id"],
                                        chunk_index=src_info["chunk_index"],
                                        section_name=src_info["section_name"],
                                        start_page=src_info["start_page"],
                                        end_page=src_info["end_page"],
                                    )
                                )

                        validated_differences.append(
                            SynthesisItem(
                                title=title,
                                description=desc,
                                paper_ids=item_pids or [p.id for p in papers],
                                citations=item_cites,
                            )
                        )

        # 4. Compared Papers Briefs
        compared_papers_brief = [
            PaperMetadataBrief(
                id=p.id,
                title=p.title,
                original_filename=p.original_filename,
                page_count=p.page_count,
                chunk_count=p.chunk_count,
            )
            for p in papers
        ]

        return StructuredComparison(
            compared_papers=compared_papers_brief,
            dimensions=validated_dimensions,
            similarities=validated_similarities,
            differences=validated_differences,
        )


paper_comparison_service = PaperComparisonService()
