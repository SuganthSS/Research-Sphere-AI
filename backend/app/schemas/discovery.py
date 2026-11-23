"""Pydantic schemas for scholarly paper discovery and open-access import."""
import uuid
from typing import List, Optional
from pydantic import BaseModel, Field, HttpUrl


class DiscoveredPaperItem(BaseModel):
    """Normalized scholarly paper metadata discovered from academic graph providers."""

    paper_id: str = Field(..., description="Unique paper identifier from provider (e.g. OpenAlex ID)")
    title: str = Field(..., description="Canonical paper title")
    authors: List[str] = Field(default_factory=list, description="List of author display names")
    year: Optional[int] = Field(None, description="Publication year")
    venue: Optional[str] = Field(None, description="Journal, conference, or repository venue")
    abstract: Optional[str] = Field(None, description="Paper abstract text")
    citation_count: int = Field(0, description="Total citations")
    doi: Optional[str] = Field(None, description="Digital Object Identifier (DOI)")
    arxiv_id: Optional[str] = Field(None, description="arXiv identifier")
    source_url: Optional[str] = Field(None, description="Landing page or source URL")
    is_open_access: bool = Field(False, description="Whether the paper has open-access status")
    open_access_pdf_url: Optional[str] = Field(None, description="Direct URL to permitted open-access PDF")
    provider: str = Field("openalex", description="Metadata source provider name")
    topics: List[str] = Field(default_factory=list, description="Keywords, concepts, or fields of study")


class PaperDiscoverySearchResponse(BaseModel):
    """Response payload for paper discovery search."""

    query: str
    total_results: int
    papers: List[DiscoveredPaperItem]
    provider: str = "openalex"
    message: Optional[str] = None


class PaperImportRequest(BaseModel):
    """Request payload to import a discovered open-access paper into a project."""

    project_id: uuid.UUID = Field(..., description="Target ResearchSphere project UUID")
    title: str = Field(..., min_length=2, max_length=500, description="Paper title")
    open_access_pdf_url: str = Field(..., description="Verified HTTPS URL for open-access PDF")
    paper_id: Optional[str] = Field(None, description="Provider paper ID")
    doi: Optional[str] = Field(None, description="DOI string")
    arxiv_id: Optional[str] = Field(None, description="arXiv ID")
    authors: List[str] = Field(default_factory=list, description="Author names")
    year: Optional[int] = Field(None, description="Publication year")
    venue: Optional[str] = Field(None, description="Publication venue")
    abstract: Optional[str] = Field(None, description="Paper abstract")
    citation_count: Optional[int] = Field(None, description="Citation count")
    source_url: Optional[str] = Field(None, description="Source landing URL")
    auto_extract: bool = Field(True, description="Whether to immediately trigger text extraction")


class PaperImportResponse(BaseModel):
    """Response returned upon successful paper import and registration."""

    paper_id: uuid.UUID
    project_id: uuid.UUID
    project_name: Optional[str] = None
    title: str
    original_filename: str
    stored_filename: str
    file_size: int
    mime_type: str = "application/pdf"
    status: str
    extraction_status: str
    page_count: Optional[int] = None
    message: str
