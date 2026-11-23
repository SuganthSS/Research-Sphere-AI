"""Pydantic schemas for evidence-grounded research gap identification."""
import uuid
from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, Field

SCIENTIFIC_CAUTION_NOTICE = (
    "Potential gaps are inferred from the selected literature and should be validated against "
    "the broader scientific literature before being treated as established research gaps."
)

GapType = Literal[
    "Methodological Gap",
    "Dataset / Evaluation Gap",
    "Limitation-Derived Gap",
    "Future-Work Gap",
    "Cross-Paper Inconsistency / Underexplored Connection",
]

ConfidenceLevel = Literal["High", "Medium", "Low"]


class GapCitationItem(BaseModel):
    """Authoritative chunk citation verifying a claim in a potential research gap."""
    source_number: int = Field(..., description="Deterministic reference number [1], [2], etc.")
    paper_id: uuid.UUID
    paper_title: str
    chunk_id: uuid.UUID
    chunk_index: int
    section_name: str
    start_page: int
    end_page: int
    text: str


class PotentialResearchGap(BaseModel):
    """An evidence-supported potential research gap inferred strictly from the analyzed corpus."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str = Field(..., min_length=3, max_length=300)
    gap_type: GapType = Field(..., description="Categorized gap taxonomy")
    potential_gap: str = Field(..., description="Conservative, non-speculative statement of the potential gap")
    rationale: str = Field(..., description="Authoritative evidence and rationale derived from the papers")
    why_it_matters: str = Field(..., description="Potential scientific importance or research opportunity")
    supporting_papers: List[uuid.UUID] = Field(default_factory=list)
    confidence: ConfidenceLevel = Field(
        ...,
        description="Confidence level regarding strength of evidence within selected corpus (High, Medium, Low)",
    )
    citations: List[GapCitationItem] = Field(
        default_factory=list,
        description="List of authoritative PaperChunk citations validating this gap",
    )


class AnalyzeResearchGapsRequest(BaseModel):
    """Request payload to analyze research gaps for a project or selected papers."""
    scope: Literal["selected", "project"] = Field(
        "project",
        description="Literature scope: 'project' (all indexed papers in project) or 'selected' (explicit paper_ids).",
    )
    paper_ids: Optional[List[uuid.UUID]] = Field(
        None,
        description="List of target paper UUIDs when scope is 'selected'.",
    )
    force_regenerate: bool = Field(
        False,
        description="Force a fresh analysis rather than returning cached revision.",
    )


class ResearchGapAnalysisResponse(BaseModel):
    """Structured response containing potential research gaps and scientific caution notice."""
    id: uuid.UUID
    project_id: uuid.UUID
    paper_ids: List[uuid.UUID]
    gaps: List[PotentialResearchGap]
    total_gaps: int
    insufficient_evidence: bool = False
    insufficient_evidence_reason: Optional[str] = None
    caution_notice: str = Field(default=SCIENTIFIC_CAUTION_NOTICE)
    model_provider: str = "groq"
    model_name: str = "llama-3.3-70b-versatile"
    version: int = 1
    created_at: datetime
    updated_at: datetime
