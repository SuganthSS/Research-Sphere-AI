"""Pydantic schemas for research paper requests, responses, pages, and extraction results."""
import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class PaperResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_name: Optional[str] = None
    title: str
    original_filename: str
    file_size: int
    mime_type: str
    status: str
    extraction_status: str = "not_started"
    page_count: Optional[int] = None
    extracted_at: Optional[datetime] = None
    extraction_error: Optional[str] = None
    chunking_status: str = "not_started"
    chunk_count: Optional[int] = None
    chunked_at: Optional[datetime] = None
    chunking_error: Optional[str] = None
    embedding_status: str = "not_started"
    embedded_chunk_count: Optional[int] = None
    embedded_at: Optional[datetime] = None
    embedding_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaperListResponse(BaseModel):
    papers: List[PaperResponse]
    total: int


class PaperPageResponse(BaseModel):
    id: uuid.UUID
    paper_id: uuid.UUID
    page_number: int
    text: str
    character_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class PaperPagesListResponse(BaseModel):
    paper_id: uuid.UUID
    page_count: int
    pages: List[PaperPageResponse]


class PaperExtractionResponse(BaseModel):
    paper_id: uuid.UUID
    extraction_status: str
    page_count: int
    extracted_at: datetime
    message: str


class PaperChunkResponse(BaseModel):
    id: Optional[uuid.UUID] = None
    chunk_index: int
    section_name: Optional[str] = None
    text: str
    character_count: int
    token_count_estimate: Optional[int] = None
    start_page: int
    end_page: int

    model_config = {"from_attributes": True}


class PaperChunksListResponse(BaseModel):
    paper_id: uuid.UUID
    chunk_count: int
    sections: List[str]
    chunks: List[PaperChunkResponse]


class PaperProcessingResponse(BaseModel):
    paper_id: uuid.UUID
    chunking_status: str
    chunk_count: int
    sections_detected: List[str]
    chunked_at: datetime
    message: str


class PaperEmbeddingResponse(BaseModel):
    paper_id: uuid.UUID
    embedding_status: str
    embedded_chunk_count: int
    embedded_at: datetime
    message: str
