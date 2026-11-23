"""Pydantic schemas for semantic vector search requests and traceable chunk results."""
import uuid
from typing import List, Optional
from pydantic import BaseModel, Field


class SemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000, description="Natural language search query")
    project_id: Optional[uuid.UUID] = Field(None, description="Scope search to a specific project")
    paper_id: Optional[uuid.UUID] = Field(None, description="Scope search to a specific paper")
    limit: int = Field(default=5, ge=1, le=20, description="Maximum number of relevant chunks to retrieve")


class SearchResultItem(BaseModel):
    score: float = Field(..., description="Cosine similarity score (0.0 to 1.0)")
    paper_id: uuid.UUID
    paper_title: str
    project_id: uuid.UUID
    chunk_id: uuid.UUID
    chunk_index: int
    section_name: Optional[str] = "Unknown"
    start_page: int
    end_page: int
    text: str
    character_count: int
    token_count_estimate: Optional[int] = None


class SemanticSearchResponse(BaseModel):
    query: str
    total_results: int
    results: List[SearchResultItem]
