"""Pydantic schemas for multi-paper evidence-grounded comparison."""
import uuid
from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class ComparisonCitation(BaseModel):
    """Authoritative chunk citation linked to a paper comparison claim."""
    source_number: int
    paper_id: uuid.UUID
    chunk_id: uuid.UUID
    chunk_index: int
    section_name: str
    start_page: int
    end_page: int


class PaperMetadataBrief(BaseModel):
    """Brief metadata for a compared paper."""
    id: uuid.UUID
    title: str
    original_filename: str
    page_count: Optional[int] = None
    chunk_count: Optional[int] = None


class PaperDimensionSummary(BaseModel):
    """Summary of a specific dimension for an individual paper with supporting citations."""
    paper_id: uuid.UUID
    paper_title: str
    summary: str
    citations: List[ComparisonCitation] = Field(default_factory=list)


class ComparisonDimensionRow(BaseModel):
    """One of the 6 core comparison dimensions contrasted across all compared papers."""
    dimension: str
    label: str
    papers: Dict[str, PaperDimensionSummary] = Field(
        default_factory=dict,
        description="Map of paper_id string to PaperDimensionSummary",
    )
    synthesis: Optional[str] = Field(
        default=None,
        description="Comparative contrast or synthesis across the papers for this dimension",
    )


class SynthesisItem(BaseModel):
    """Comparative synthesis item (major similarity or major difference)."""
    title: str
    description: str
    paper_ids: List[uuid.UUID] = Field(default_factory=list)
    citations: List[ComparisonCitation] = Field(default_factory=list)


class StructuredComparison(BaseModel):
    """Complete 6-dimensional structured comparison matrix and synthesis."""
    compared_papers: List[PaperMetadataBrief]
    dimensions: Dict[str, ComparisonDimensionRow]
    similarities: List[SynthesisItem] = Field(default_factory=list)
    differences: List[SynthesisItem] = Field(default_factory=list)


class ComparePapersRequest(BaseModel):
    """API payload for POST /api/comparisons."""
    paper_ids: List[uuid.UUID] = Field(
        ...,
        min_length=2,
        max_length=5,
        description="List of 2 to 5 owned and indexed research paper IDs to compare",
    )


class PaperComparisonResponse(BaseModel):
    """API response model for GET/POST /api/comparisons."""
    id: uuid.UUID
    user_id: uuid.UUID
    paper_ids: List[uuid.UUID]
    comparison: StructuredComparison
    model_provider: str
    model_name: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
