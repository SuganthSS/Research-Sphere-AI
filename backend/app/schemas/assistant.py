"""Pydantic schemas for the AI Research Assistant."""
import uuid
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class AskAssistantRequest(BaseModel):
    question: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="The scientific research question to ask.",
        examples=["What methodology is proposed in this paper?"],
    )
    scope: Literal["paper", "project"] = Field(
        ...,
        description="Scope of literature to answer from: 'paper' or 'project'.",
    )
    paper_id: Optional[uuid.UUID] = Field(
        None,
        description="Target paper UUID. Required when scope is 'paper'.",
    )
    project_id: Optional[uuid.UUID] = Field(
        None,
        description="Target project UUID. Required when scope is 'project'.",
    )


class SourceCitationItem(BaseModel):
    source_number: int = Field(..., description="Deterministic reference number [1], [2], etc.")
    paper_id: uuid.UUID
    paper_title: str
    chunk_id: uuid.UUID
    chunk_index: int
    section_name: str
    start_page: int
    end_page: int
    similarity_score: float
    text: str


class AskAssistantResponse(BaseModel):
    question: str
    answer: str
    scope: str
    paper_id: Optional[uuid.UUID] = None
    project_id: Optional[uuid.UUID] = None
    sources: List[SourceCitationItem]
    total_sources: int
    insufficient_evidence: bool = False


class AssistantStatusResponse(BaseModel):
    provider: str
    model: str
    configured: bool
    status: str
    message: str
