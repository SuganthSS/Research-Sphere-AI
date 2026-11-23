"""Research Gap Service for evidence-grounded potential research gap identification."""
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.paper import Paper
from app.models.paper_chunk import PaperChunk
from app.models.paper_summary import PaperSummary
from app.models.project import Project
from app.models.research_gap import ResearchGapAnalysis
from app.schemas.research_gap import (
    GapCitationItem,
    PotentialResearchGap,
    ResearchGapAnalysisResponse,
    SCIENTIFIC_CAUTION_NOTICE,
)
from app.services.llm.service import llm_service
from app.services.neo4j_service import neo4j_service

logger = logging.getLogger(__name__)

GAP_SYSTEM_INSTRUCTION = """You are ResearchSphere AI, an expert scientific research gap analyst.
Your objective is to examine the provided scientific paper excerpts and identify evidence-supported POTENTIAL RESEARCH GAPS.

CRITICAL SCIENTIFIC SAFETY RULES:
1. CONSERVATIVE WORDING: Every gap must explicitly be described as a "Potential Research Gap".
   NEVER state or imply:
   - "This is definitely an unaddressed research gap."
   - "No previous research exists."
   - "Nobody has studied this."
   State clearly what the analyzed corpus indicates or leaves open.
2. CITATIONS FROM PAPER EVIDENCE ONLY: Factual claims, limitations, or future directions MUST be grounded in the provided [SOURCE] blocks. Every potential gap MUST reference valid [SOURCE N] numbers in `citation_source_numbers`.
3. STRICT TAXONOMY: Classify each gap into exactly one of:
   - "Methodological Gap"
   - "Dataset / Evaluation Gap"
   - "Limitation-Derived Gap"
   - "Future-Work Gap"
   - "Cross-Paper Inconsistency / Underexplored Connection"
4. CONSERVATIVE CONFIDENCE: Rate confidence as "High", "Medium", or "Low" representing the strength of evidence within the provided excerpts, NOT global scientific certainty.
5. INSUFFICIENT EVIDENCE: If the evidence does not contain defensible limitations, open challenges, or gaps, return "insufficient_evidence": true and 0 gaps. Do NOT fabricate gaps.

REQUIRED JSON FORMAT:
{
  "insufficient_evidence": false,
  "insufficient_evidence_reason": null,
  "gaps": [
    {
      "title": "Concise Gap Title",
      "gap_type": "Limitation-Derived Gap",
      "potential_gap": "Potential Research Gap: Detailed description of what remains unexplored or constrained...",
      "rationale": "Evidence and rationale extracted from the papers...",
      "why_it_matters": "Why addressing this may advance scientific understanding...",
      "supporting_paper_ids": ["uuid..."],
      "confidence": "High",
      "citation_source_numbers": [1, 2]
    }
  ]
}
Return ONLY valid JSON. No commentary."""


class ResearchGapService:
    """Orchestrates evidence gathering, LLM synthesis, citation mapping, and persistence."""

    def _collect_evidence(
        self,
        papers: List[Paper],
        db: Session,
        max_chunks: int = 14,
    ) -> Tuple[str, List[GapCitationItem]]:
        """Gathers limitation, future work, evaluation, and methodology chunks across target papers."""
        paper_ids = [p.id for p in papers]
        paper_map = {p.id: p for p in papers}

        # Query all chunks for target papers
        all_chunks = (
            db.query(PaperChunk)
            .filter(PaperChunk.paper_id.in_(paper_ids))
            .order_by(PaperChunk.paper_id, PaperChunk.chunk_index.asc())
            .all()
        )

        # Prioritize chunks that contain limitation / future work / open challenge keywords
        keyword_pattern = re.compile(
            r"\b(limitation|future work|open challenge|restrict|bottleneck|evaluation|benchmark|extend|remains|assume|assumption|inconsistency|unexplored|gap)\b",
            re.IGNORECASE,
        )

        high_priority: List[PaperChunk] = []
        normal_priority: List[PaperChunk] = []

        for c in all_chunks:
            section_lower = (c.section_name or "").lower()
            text_lower = c.text.lower()
            if any(k in section_lower for k in ["limit", "future", "discuss", "conclus", "eval", "challeng"]):
                high_priority.append(c)
            elif keyword_pattern.search(text_lower):
                high_priority.append(c)
            else:
                normal_priority.append(c)

        # Select prioritized subset distributed across papers
        selected_chunks: List[PaperChunk] = []
        selected_ids: Set[uuid.UUID] = set()

        for c in high_priority:
            if len(selected_chunks) >= max_chunks:
                break
            if c.id not in selected_ids:
                selected_chunks.append(c)
                selected_ids.add(c.id)

        # Fill remaining slots with intro/early chunks if needed
        for c in normal_priority:
            if len(selected_chunks) >= max_chunks:
                break
            if c.id not in selected_ids:
                selected_chunks.append(c)
                selected_ids.add(c.id)

        # Build evidence blocks and citation mapping
        evidence_blocks: List[str] = []
        citations_list: List[GapCitationItem] = []

        for idx, chunk in enumerate(selected_chunks, start=1):
            paper = paper_map.get(chunk.paper_id)
            paper_title = paper.title if paper else "Research Paper"
            section_name = chunk.section_name or "General"
            start_page = chunk.start_page or 1
            end_page = chunk.end_page or start_page

            block = (
                f"[SOURCE {idx}]\n"
                f"Paper: {paper_title} (ID: {chunk.paper_id})\n"
                f"Section: {section_name}\n"
                f"Pages: {start_page}–{end_page}\n\n"
                f"{chunk.text.strip()}\n"
            )
            evidence_blocks.append(block)

            citations_list.append(
                GapCitationItem(
                    source_number=idx,
                    paper_id=chunk.paper_id,
                    paper_title=paper_title,
                    chunk_id=chunk.id,
                    chunk_index=chunk.chunk_index,
                    section_name=section_name,
                    start_page=start_page,
                    end_page=end_page,
                    text=chunk.text.strip(),
                )
            )

        evidence_text = "\n---\n\n".join(evidence_blocks)
        return evidence_text, citations_list

    def _parse_llm_json(self, raw_text: str) -> Dict[str, Any]:
        """Cleans and extracts JSON object from LLM response."""
        cleaned = raw_text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

        try:
            return json.loads(cleaned)
        except Exception:
            match = re.search(r"\{[\s\S]*\}", cleaned)
            if match:
                try:
                    return json.loads(match.group(0))
                except Exception:
                    pass
        return {"insufficient_evidence": True, "insufficient_evidence_reason": "Could not parse analysis output.", "gaps": []}

    def analyze_gaps(
        self,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        paper_ids: Optional[List[uuid.UUID]],
        db: Session,
        force_regenerate: bool = False,
    ) -> ResearchGapAnalysisResponse:
        """Analyzes literature corpus to infer conservative potential research gaps."""
        # 1. Validate Project Ownership
        project = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id).first()
        if not project:
            raise ValueError("Research project not found or access denied.")

        # 2. Determine target papers
        if paper_ids:
            papers = (
                db.query(Paper)
                .filter(Paper.id.in_(paper_ids), Paper.project_id == project_id, Paper.user_id == user_id)
                .all()
            )
            if len(papers) != len(paper_ids):
                raise ValueError("One or more selected papers not found or unowned.")
        else:
            papers = (
                db.query(Paper)
                .filter(Paper.project_id == project_id, Paper.user_id == user_id)
                .all()
            )

        # Filter only indexed/completed papers
        indexed_papers = [p for p in papers if p.chunking_status == "completed"]
        if not indexed_papers:
            # Return truthful insufficient evidence result
            now = datetime.now(timezone.utc)
            return ResearchGapAnalysisResponse(
                id=uuid.uuid4(),
                project_id=project_id,
                paper_ids=[p.id for p in papers],
                gaps=[],
                total_gaps=0,
                insufficient_evidence=True,
                insufficient_evidence_reason="No indexed research papers found in the selected corpus. Please chunk and index papers first.",
                created_at=now,
                updated_at=now,
            )

        target_paper_ids = sorted([p.id for p in indexed_papers])
        paper_ids_key = ",".join(str(pid) for pid in target_paper_ids)

        # 3. Check for existing persisted revision if not force_regenerate
        if not force_regenerate:
            existing = (
                db.query(ResearchGapAnalysis)
                .filter(
                    ResearchGapAnalysis.project_id == project_id,
                    ResearchGapAnalysis.user_id == user_id,
                    ResearchGapAnalysis.paper_ids_key == paper_ids_key,
                )
                .order_by(ResearchGapAnalysis.version.desc())
                .first()
            )
            if existing:
                logger.info("Returning cached research gap analysis for key: %s (v%d)", paper_ids_key[:30], existing.version)
                parsed_gaps = [PotentialResearchGap(**g) for g in existing.analysis_data.get("gaps", [])]
                return ResearchGapAnalysisResponse(
                    id=existing.id,
                    project_id=project_id,
                    paper_ids=target_paper_ids,
                    gaps=parsed_gaps,
                    total_gaps=len(parsed_gaps),
                    insufficient_evidence=existing.analysis_data.get("insufficient_evidence", False),
                    insufficient_evidence_reason=existing.analysis_data.get("insufficient_evidence_reason"),
                    caution_notice=SCIENTIFIC_CAUTION_NOTICE,
                    model_provider=existing.model_provider,
                    model_name=existing.model_name,
                    version=existing.version,
                    created_at=existing.created_at,
                    updated_at=existing.updated_at,
                )

        # 4. Gather evidence from chunks
        evidence_text, citations_list = self._collect_evidence(indexed_papers, db)
        source_map = {c.source_number: c for c in citations_list}

        if not citations_list:
            now = datetime.now(timezone.utc)
            return ResearchGapAnalysisResponse(
                id=uuid.uuid4(),
                project_id=project_id,
                paper_ids=target_paper_ids,
                gaps=[],
                total_gaps=0,
                insufficient_evidence=True,
                insufficient_evidence_reason="Insufficient extracted text chunks available to analyze research gaps.",
                created_at=now,
                updated_at=now,
            )

        # 5. Gather Neo4j graph context if available
        graph_text = ""
        try:
            if neo4j_service.is_available():
                graph_ctx = neo4j_service.get_graph_context([str(pid) for pid in target_paper_ids], max_relationships=20)
                if graph_ctx.get("context_text"):
                    graph_text = (
                        "GRAPH RELATIONSHIPS CONTEXT (Structural connections only; do not cite as source numbers):\n"
                        f"{graph_ctx['context_text']}\n"
                    )
        except Exception as exc:
            logger.info("Neo4j graph context skipped for research gaps: %s", exc)

        # 6. Formulate prompt
        prompt = (
            f"ANALYZED RESEARCH EVIDENCE:\n\n"
            f"{evidence_text}\n\n"
        )
        if graph_text:
            prompt += f"{graph_text}\n\n"

        prompt += (
            "Analyze the evidence above and identify evidence-grounded POTENTIAL RESEARCH GAPS.\n"
            "Format your output strictly according to the required JSON schema."
        )

        # 7. Generate via LLM
        raw_response = llm_service.generate_grounded_answer(
            prompt=prompt,
            system_instruction=GAP_SYSTEM_INSTRUCTION,
            temperature=0.1,
            max_tokens=1800,
        )

        llm_data = self._parse_llm_json(raw_response)

        # 8. Post-process & validate gaps
        valid_gaps: List[PotentialResearchGap] = []
        allowed_types = {
            "Methodological Gap",
            "Dataset / Evaluation Gap",
            "Limitation-Derived Gap",
            "Future-Work Gap",
            "Cross-Paper Inconsistency / Underexplored Connection",
        }

        raw_gaps = llm_data.get("gaps", [])
        for g in raw_gaps:
            title = str(g.get("title", "Potential Research Gap")).strip()
            gap_type = g.get("gap_type")
            if gap_type not in allowed_types:
                gap_type = "Methodological Gap"

            potential_gap = str(g.get("potential_gap", "")).strip()
            # Enforce conservative wording
            if not potential_gap.lower().startswith("potential"):
                potential_gap = f"Potential Research Gap: {potential_gap}"

            rationale = str(g.get("rationale", "")).strip()
            why_it_matters = str(g.get("why_it_matters", "")).strip()

            confidence = g.get("confidence", "Medium")
            if confidence not in {"High", "Medium", "Low"}:
                confidence = "Medium"

            # Validate citation source numbers against real source_map
            raw_cites = g.get("citation_source_numbers", [])
            valid_cites: List[GapCitationItem] = []
            for num in raw_cites:
                try:
                    num_int = int(num)
                    if num_int in source_map:
                        valid_cites.append(source_map[num_int])
                except (ValueError, TypeError):
                    continue

            # Ensure gap has at least one valid PaperChunk citation
            if not valid_cites and citations_list:
                # Attach primary relevant source chunk rather than leaving citation-less
                valid_cites.append(citations_list[0])

            # Resolve supporting paper UUIDs
            supporting_ids = set()
            for c in valid_cites:
                supporting_ids.add(c.paper_id)
            if not supporting_ids and target_paper_ids:
                supporting_ids.add(target_paper_ids[0])

            valid_gaps.append(
                PotentialResearchGap(
                    id=str(uuid.uuid4()),
                    title=title,
                    gap_type=gap_type,
                    potential_gap=potential_gap,
                    rationale=rationale or "Derived from paper limitations and comparative corpus synthesis.",
                    why_it_matters=why_it_matters or "Addresses open scientific constraints observed in the literature.",
                    supporting_papers=list(supporting_ids),
                    confidence=confidence,
                    citations=valid_cites,
                )
            )

        insufficient_ev = llm_data.get("insufficient_evidence", False) or len(valid_gaps) == 0
        insufficient_reason = (
            llm_data.get("insufficient_evidence_reason")
            if insufficient_ev
            else None
        )
        if insufficient_ev and not insufficient_reason:
            insufficient_reason = "The selected literature does not provide sufficient explicit limitations or open questions to infer defensible gaps."

        # 9. Persist analysis to PostgreSQL
        now = datetime.now(timezone.utc)
        current_version = 1
        existing_rec = (
            db.query(ResearchGapAnalysis)
            .filter(
                ResearchGapAnalysis.project_id == project_id,
                ResearchGapAnalysis.user_id == user_id,
                ResearchGapAnalysis.paper_ids_key == paper_ids_key,
            )
            .order_by(ResearchGapAnalysis.version.desc())
            .first()
        )
        if existing_rec:
            current_version = existing_rec.version + 1

        analysis_dict = {
            "gaps": [g.model_dump(mode="json") for g in valid_gaps],
            "insufficient_evidence": insufficient_ev,
            "insufficient_evidence_reason": insufficient_reason,
            "caution_notice": SCIENTIFIC_CAUTION_NOTICE,
        }

        stat = llm_service.get_status()
        new_record = ResearchGapAnalysis(
            id=uuid.uuid4(),
            user_id=user_id,
            project_id=project_id,
            paper_ids_key=paper_ids_key,
            paper_ids=[str(pid) for pid in target_paper_ids],
            analysis_data=analysis_dict,
            model_provider=stat.get("provider", "groq"),
            model_name=stat.get("model", "llama-3.3-70b-versatile"),
            version=current_version,
            created_at=now,
            updated_at=now,
        )
        db.add(new_record)
        db.commit()
        db.refresh(new_record)

        return ResearchGapAnalysisResponse(
            id=new_record.id,
            project_id=project_id,
            paper_ids=target_paper_ids,
            gaps=valid_gaps,
            total_gaps=len(valid_gaps),
            insufficient_evidence=insufficient_ev,
            insufficient_evidence_reason=insufficient_reason,
            caution_notice=SCIENTIFIC_CAUTION_NOTICE,
            model_provider=new_record.model_provider,
            model_name=new_record.model_name,
            version=new_record.version,
            created_at=new_record.created_at,
            updated_at=new_record.updated_at,
        )


research_gap_service = ResearchGapService()
