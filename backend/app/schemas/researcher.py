"""Pydantic schemas for researcher discovery and collaboration suggestions."""
import uuid
from typing import List, Optional
from pydantic import BaseModel, Field

COLLABORATION_CAUTION_NOTICE = (
    "Collaboration suggestions are inferred from publications available in your ResearchSphere "
    "corpus and do not indicate researcher availability or willingness to collaborate."
)


class ResearcherPaperBrief(BaseModel):
    """Brief metadata for a paper authored by a researcher in the corpus."""
    paper_id: uuid.UUID
    paper_title: str
    project_id: uuid.UUID
    project_name: str


class ResearcherProfile(BaseModel):
    """Profile of an author discovered within the user's research corpus."""
    author_id: str
    name: str
    papers_count: int
    papers: List[ResearcherPaperBrief] = Field(default_factory=list)
    topics: List[str] = Field(default_factory=list)
    methods: List[str] = Field(default_factory=list)
    relevance_score: float = Field(..., ge=0.0, le=1.0)
    match_label: str = Field(default="Potential Collaboration Match")
    collaboration_explanation: str = Field(..., description="Explanation of why this researcher may be relevant")


class ResearcherDiscoveryResponse(BaseModel):
    """Response containing discovered researchers and collaboration matches."""
    total_researchers: int
    researchers: List[ResearcherProfile] = Field(default_factory=list)
    caution_notice: str = Field(default=COLLABORATION_CAUTION_NOTICE)
    message: Optional[str] = None
