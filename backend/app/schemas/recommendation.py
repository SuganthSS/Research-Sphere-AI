"""Pydantic schemas for research paper recommendations."""
import uuid
from typing import List, Optional
from pydantic import BaseModel, Field


class PaperRecommendationItem(BaseModel):
    """A recommended paper from the user's corpus with transparent reasoning."""
    paper_id: uuid.UUID
    paper_title: str
    project_id: uuid.UUID
    project_name: str
    relevance_score: float = Field(..., ge=0.0, le=1.0, description="Normalized score 0.0 - 1.0")
    shared_topics: List[str] = Field(default_factory=list)
    shared_methods: List[str] = Field(default_factory=list)
    recommendation_reason: str = Field(..., description="Transparent rationale explaining the recommendation")
    source_paper_title: Optional[str] = None


class PaperRecommendationsRequest(BaseModel):
    """Request payload to retrieve corpus paper recommendations."""
    target_paper_id: Optional[uuid.UUID] = Field(
        None,
        description="Target reference paper to find recommendations for.",
    )
    project_id: Optional[uuid.UUID] = Field(
        None,
        description="Optional project scope filter.",
    )
    limit: int = Field(5, ge=1, le=20)


class PaperRecommendationsResponse(BaseModel):
    """Response containing transparent corpus-based paper recommendations."""
    target_paper_id: Optional[uuid.UUID] = None
    target_paper_title: Optional[str] = None
    total_recommendations: int
    recommendations: List[PaperRecommendationItem] = Field(default_factory=list)
    message: Optional[str] = None
