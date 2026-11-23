"""Pydantic schemas for structured scientific paper summaries."""
import uuid
from datetime import datetime
from typing import List
from pydantic import BaseModel, Field


class SummaryCitation(BaseModel):
    """Authoritative chunk citation linked to a summary section."""
    source_number: int
    paper_id: uuid.UUID
    chunk_id: uuid.UUID
    chunk_index: int
    section_name: str
    start_page: int
    end_page: int


class SummarySection(BaseModel):
    """Individual scientific summary dimension with concise text and citations."""
    summary: str
    citations: List[SummaryCitation] = Field(default_factory=list)


class StructuredSummary(BaseModel):
    """Complete 6-dimensional structured summary for a research paper."""
    objective: SummarySection
    methodology: SummarySection
    dataset_setup: SummarySection
    key_findings: SummarySection
    limitations: SummarySection
    future_work: SummarySection


class PaperSummaryResponse(BaseModel):
    """API response model for GET/POST /api/papers/{paper_id}/summary."""
    id: uuid.UUID
    paper_id: uuid.UUID
    summary: StructuredSummary
    model_provider: str
    model_name: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
