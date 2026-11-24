"""Paper API endpoints for document ingestion, retrieval, page extraction, and management."""
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Response
from fastapi.responses import FileResponse
from sqlalchemy import select, delete
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.paper import Paper
from app.models.paper_page import PaperPage
from app.models.paper_graph import PaperGraph
from app.models.project import Project
from app.models.user import User
from app.schemas.paper import (
    PaperResponse,
    PaperListResponse,
    PaperPageResponse,
    PaperPagesListResponse,
    PaperExtractionResponse,
    PaperChunkResponse,
    PaperChunksListResponse,
    PaperProcessingResponse,
    PaperEmbeddingResponse,
)
from app.schemas.summary import PaperSummaryResponse
from app.services.paper_storage import paper_storage
from app.services.pdf_extraction import pdf_extractor, PDFExtractionError
from app.services.document_processing import document_processor, DocumentProcessingError
from app.services.embedding import embedding_service
from app.services.qdrant_service import qdrant_service
from app.services.neo4j_service import neo4j_service
from app.services.paper_summary_service import (
    paper_summary_service,
    PaperPreconditionError,
    PaperSummaryError,
)
from app.models.paper_chunk import PaperChunk

logger = logging.getLogger(__name__)

router = APIRouter()


def derive_title_from_filename(filename: str) -> str:
    """Derives a clean human-readable display title safely from the uploaded filename."""
    raw = re.sub(r"\.[pP][dD][fF]$", "", filename)
    cleaned = re.sub(r"[_\-]+", " ", raw).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned if cleaned else "Untitled Research Paper"


def validate_pdf_content(file_bytes: bytes, filename: str) -> None:
    """Validates that the uploaded content is a non-empty, valid PDF within size limits."""
    # 1. Filename validation
    if not filename or not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF documents with a .pdf extension are accepted.",
        )

    # 2. File size validation
    size = len(file_bytes)
    if size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty (0 bytes). Please upload a valid scientific PDF.",
        )

    if size > settings.MAX_UPLOAD_SIZE_BYTES:
        max_mb = int(settings.MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed upload limit of {max_mb} MB.",
        )

    # 3. Magic bytes / PDF header signature check
    if not file_bytes.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid document format: missing '%PDF-' header signature. File is not a valid PDF.",
        )


def _build_paper_response(paper: Paper, project_name: str | None = None) -> PaperResponse:
    """Helper to convert a Paper model to PaperResponse schema consistently."""
    p_name = project_name
    if p_name is None and getattr(paper, "project", None):
        p_name = paper.project.name

    return PaperResponse(
        id=paper.id,
        project_id=paper.project_id,
        project_name=p_name,
        title=paper.title,
        original_filename=paper.original_filename,
        file_size=paper.file_size,
        mime_type=paper.mime_type,
        status=paper.status,
        extraction_status=paper.extraction_status,
        page_count=paper.page_count,
        extracted_at=paper.extracted_at,
        extraction_error=paper.extraction_error,
        chunking_status=paper.chunking_status,
        chunk_count=paper.chunk_count,
        chunked_at=paper.chunked_at,
        chunking_error=paper.chunking_error,
        embedding_status=getattr(paper, "embedding_status", "not_started"),
        embedded_chunk_count=getattr(paper, "embedded_chunk_count", None),
        embedded_at=getattr(paper, "embedded_at", None),
        embedding_error=getattr(paper, "embedding_error", None),
        created_at=paper.created_at,
        updated_at=paper.updated_at,
    )


@router.post(
    "/projects/{project_id}/papers",
    response_model=PaperResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a scientific PDF paper to a research project",
)
async def upload_paper(
    project_id: uuid.UUID,
    file: Annotated[UploadFile, File(description="Scientific PDF document file")],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PaperResponse:
    """Upload and ingest a PDF document associated strictly with the current user's project."""
    # 1. Verify project ownership (404 if missing or foreign)
    stmt = select(Project).where(
        Project.id == project_id,
        Project.user_id == current_user.id,
    )
    project = db.execute(stmt).scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research project not found.",
        )

    # 2. Read and validate file content
    filename = file.filename or "document.pdf"
    file_bytes = await file.read()
    validate_pdf_content(file_bytes, filename)

    # 3. Store file securely
    storage_key, _ = paper_storage.save(file_bytes, current_user.id, project_id)

    # 4. Create Paper record in PostgreSQL
    paper = Paper(
        user_id=current_user.id,
        project_id=project_id,
        title=derive_title_from_filename(filename),
        original_filename=filename,
        stored_filename=storage_key,
        file_size=len(file_bytes),
        mime_type=file.content_type or "application/pdf",
        status="uploaded",
        extraction_status="not_started",
    )

    try:
        db.add(paper)
        db.commit()
        db.refresh(paper)
    except Exception:
        db.rollback()
        paper_storage.delete(storage_key)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to register paper metadata in database.",
        )

    return _build_paper_response(paper, project.name)


@router.get(
    "/projects/{project_id}/papers",
    response_model=PaperListResponse,
    summary="List all papers in a specific research project",
)
def list_project_papers(
    project_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PaperListResponse:
    """Retrieve papers belonging to the specified project, scoped strictly to the current user."""
    # Verify project exists and is owned by current user
    stmt = select(Project).where(
        Project.id == project_id,
        Project.user_id == current_user.id,
    )
    project = db.execute(stmt).scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research project not found.",
        )

    papers_stmt = (
        select(Paper)
        .where(Paper.project_id == project_id, Paper.user_id == current_user.id)
        .order_by(Paper.created_at.desc())
    )
    papers = db.execute(papers_stmt).scalars().all()

    items = [_build_paper_response(p, project.name) for p in papers]
    return PaperListResponse(papers=items, total=len(items))


@router.get(
    "/papers",
    response_model=PaperListResponse,
    summary="List all research papers for the authenticated user",
)
def list_all_papers(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PaperListResponse:
    """Retrieve all papers across all projects owned by the authenticated researcher."""
    stmt = (
        select(Paper)
        .options(joinedload(Paper.project))
        .where(Paper.user_id == current_user.id)
        .order_by(Paper.created_at.desc())
    )
    papers = db.execute(stmt).scalars().all()

    items = [_build_paper_response(p) for p in papers]
    return PaperListResponse(papers=items, total=len(items))


@router.get(
    "/papers/{paper_id}",
    response_model=PaperResponse,
    summary="Get single paper details",
)
def get_paper(
    paper_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PaperResponse:
    """Retrieve metadata for a specific paper, enforcing strict ownership isolation."""
    stmt = (
        select(Paper)
        .options(joinedload(Paper.project))
        .where(Paper.id == paper_id, Paper.user_id == current_user.id)
    )
    paper = db.execute(stmt).scalar_one_or_none()
    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research paper not found.",
        )

    return _build_paper_response(paper)


@router.get(
    "/papers/{paper_id}/file",
    summary="Download or view the original PDF document",
)
def get_paper_file(
    paper_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Securely stream or retrieve the original PDF document for authenticated owners."""
    stmt = select(Paper).where(
        Paper.id == paper_id,
        Paper.user_id == current_user.id,
    )
    paper = db.execute(stmt).scalar_one_or_none()
    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research paper not found.",
        )

    file_path = paper_storage.get_path(paper.stored_filename)
    if not file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Physical document file not found on storage server.",
        )

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=paper.original_filename,
        content_disposition_type="inline",
    )


@router.post(
    "/papers/{paper_id}/extract",
    response_model=PaperExtractionResponse,
    summary="Extract page-preserved text from an uploaded research PDF",
)
def extract_paper(
    paper_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PaperExtractionResponse:
    """Extracts text page-by-page from the stored PDF using PyMuPDF, preserving page boundaries."""
    # 1. Enforce strict ownership
    stmt = select(Paper).where(
        Paper.id == paper_id,
        Paper.user_id == current_user.id,
    )
    paper = db.execute(stmt).scalar_one_or_none()
    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research paper not found.",
        )

    # 2. Mark extraction processing
    paper.extraction_status = "processing"
    paper.extraction_error = None
    db.commit()

    # 3. Perform extraction via PDF extraction service
    try:
        extraction_result = pdf_extractor.extract_from_storage(paper.stored_filename)
    except PDFExtractionError as e:
        paper.extraction_status = "failed"
        paper.extraction_error = str(e)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Text extraction failed: {str(e)}",
        )
    except Exception:
        paper.extraction_status = "failed"
        paper.extraction_error = "Unexpected error parsing PDF document."
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during PDF text extraction.",
        )

    # 4. Idempotently replace existing page records
    db.execute(delete(PaperPage).where(PaperPage.paper_id == paper.id))

    # 5. Persist PaperPage rows
    for p in extraction_result.pages:
        db.add(
            PaperPage(
                paper_id=paper.id,
                page_number=p.page_number,
                text=p.text,
                character_count=p.character_count,
            )
        )

    # 6. Update Paper extraction status & metadata
    now_utc = datetime.now(timezone.utc)
    paper.page_count = extraction_result.page_count
    paper.extraction_status = "completed"
    paper.extracted_at = now_utc
    paper.extraction_error = None

    db.commit()
    db.refresh(paper)

    return PaperExtractionResponse(
        paper_id=paper.id,
        extraction_status=paper.extraction_status,
        page_count=paper.page_count,
        extracted_at=paper.extracted_at,
        message=f"Successfully extracted {extraction_result.page_count} pages.",
    )


@router.get(
    "/papers/{paper_id}/pages",
    response_model=PaperPagesListResponse,
    summary="Get all extracted pages for a research paper in page order",
)
def get_paper_pages(
    paper_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PaperPagesListResponse:
    """Retrieve page-preserved extracted text strictly for the authenticated owner."""
    stmt = select(Paper).where(
        Paper.id == paper_id,
        Paper.user_id == current_user.id,
    )
    paper = db.execute(stmt).scalar_one_or_none()
    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research paper not found.",
        )

    pages_stmt = (
        select(PaperPage)
        .where(PaperPage.paper_id == paper.id)
        .order_by(PaperPage.page_number.asc())
    )
    pages = db.execute(pages_stmt).scalars().all()

    page_items = [
        PaperPageResponse(
            id=p.id,
            paper_id=p.paper_id,
            page_number=p.page_number,
            text=p.text,
            character_count=p.character_count,
            created_at=p.created_at,
        )
        for p in pages
    ]

    return PaperPagesListResponse(
        paper_id=paper.id,
        page_count=paper.page_count if paper.page_count is not None else len(page_items),
        pages=page_items,
    )


@router.delete(
    "/papers/{paper_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a research paper and its stored PDF",
)
def delete_paper(
    paper_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    """Delete a paper record from PostgreSQL and remove its physical file from storage."""
    stmt = select(Paper).where(
        Paper.id == paper_id,
        Paper.user_id == current_user.id,
    )
    paper = db.execute(stmt).scalar_one_or_none()
    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research paper not found.",
        )

    # 1. Delete physical stored file
    try:
        paper_storage.delete(paper.stored_filename)
    except Exception as exc:
        logger.warning("Failed to delete physical file %s: %s", paper.stored_filename, exc)

    # 2. Delete vectors from Qdrant
    try:
        qdrant_service.delete_paper_vectors(paper.id)
    except Exception as exc:
        logger.warning("Failed to delete Qdrant vectors for paper %s: %s", paper.id, exc)

    # 3. Delete paper subgraph from Neo4j
    try:
        neo4j_service.delete_paper_subgraph(str(paper.id))
    except Exception as exc:
        logger.warning("Failed to delete Neo4j subgraph for paper %s: %s", paper.id, exc)

    # 4. Explicitly delete paper_graphs record
    try:
        db.execute(delete(PaperGraph).where(PaperGraph.paper_id == paper.id))
    except Exception as exc:
        logger.warning("Failed to explicitly delete PaperGraph for paper %s: %s", paper.id, exc)

    # 5. Delete database record (cascades automatically to PaperPage, PaperChunk, PaperSummary via relationship cascade and FK CASCADE)
    db.delete(paper)
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/papers/{paper_id}/process",
    response_model=PaperProcessingResponse,
    summary="Run text cleaning, section detection, and chunking on an extracted paper",
)
def process_paper_document(
    paper_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PaperProcessingResponse:
    """Process an extracted paper through the chunking pipeline.

    Requires extraction_status == 'completed'. Idempotent: re-processing
    replaces existing chunks. Ownership strictly enforced (404 for foreign papers).
    """
    # 1. Fetch paper with ownership check
    stmt = (
        select(Paper)
        .where(Paper.id == paper_id, Paper.user_id == current_user.id)
    )
    paper = db.execute(stmt).scalar_one_or_none()
    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research paper not found.",
        )

    # 2. Require extraction to be complete
    if paper.extraction_status != "completed":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Text extraction must be completed before processing. "
                f"Current extraction status: '{paper.extraction_status}'. "
                "Run /extract first."
            ),
        )

    # 3. Mark processing in progress and invalidate old embeddings
    paper.chunking_status = "processing"
    paper.chunking_error = None
    paper.embedding_status = "not_started"
    paper.embedded_chunk_count = None
    paper.embedded_at = None
    paper.embedding_error = None
    db.commit()

    # Clear any previous Qdrant vectors for this paper
    qdrant_service.delete_paper_vectors(paper.id)

    # 4. Run processing pipeline (reload paper to get pages via relationship)
    db.refresh(paper)
    try:
        result = document_processor.process_paper(paper, db)
    except DocumentProcessingError as exc:
        paper.chunking_status = "failed"
        paper.chunking_error = str(exc)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Document processing failed: {str(exc)}",
        )

    return PaperProcessingResponse(
        paper_id=result.paper_id,
        chunking_status="completed",
        chunk_count=result.chunk_count,
        sections_detected=result.sections_detected,
        chunked_at=result.chunked_at,
        message=f"Successfully processed document into {result.chunk_count} chunks across {len(result.sections_detected)} sections.",
    )


@router.get(
    "/papers/{paper_id}/chunks",
    response_model=PaperChunksListResponse,
    summary="Retrieve all text chunks for a processed research paper",
)
def get_paper_chunks(
    paper_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PaperChunksListResponse:
    """Retrieve all document chunks for the specified paper, ordered by chunk_index.

    Ownership strictly enforced — foreign papers return 404.
    """
    # 1. Fetch paper with ownership check
    stmt = select(Paper).where(
        Paper.id == paper_id,
        Paper.user_id == current_user.id,
    )
    paper = db.execute(stmt).scalar_one_or_none()
    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research paper not found.",
        )

    # 2. Fetch chunks ordered by chunk_index
    chunks_stmt = (
        select(PaperChunk)
        .where(PaperChunk.paper_id == paper.id)
        .order_by(PaperChunk.chunk_index.asc())
    )
    chunks = db.execute(chunks_stmt).scalars().all()

    # 3. Derive unique ordered sections list
    seen: dict = {}
    for chunk in chunks:
        sn = chunk.section_name or "Unknown"
        if sn not in seen:
            seen[sn] = True
    sections = list(seen.keys())

    chunk_items = [
        PaperChunkResponse(
            id=c.id,
            chunk_index=c.chunk_index,
            section_name=c.section_name,
            text=c.text,
            character_count=c.character_count,
            token_count_estimate=c.token_count_estimate,
            start_page=c.start_page,
            end_page=c.end_page,
        )
        for c in chunks
    ]

    return PaperChunksListResponse(
        paper_id=paper.id,
        chunk_count=len(chunk_items),
        sections=sections,
        chunks=chunk_items,
    )


@router.post(
    "/papers/{paper_id}/embed",
    response_model=PaperEmbeddingResponse,
    summary="Generate vector embeddings for all chunks of a processed paper and index in Qdrant",
)
def embed_paper_chunks(
    paper_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PaperEmbeddingResponse:
    """Vectorize all chunks of a paper using SentenceTransformers and index into Qdrant vector store.

    Requires chunking_status == 'completed'. Ownership is strictly enforced.
    """
    stmt = (
        select(Paper)
        .where(Paper.id == paper_id, Paper.user_id == current_user.id)
    )
    paper = db.execute(stmt).scalar_one_or_none()
    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research paper not found.",
        )

    if paper.chunking_status != "completed":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Document chunking must be completed before generating embeddings. "
                f"Current chunking status: '{paper.chunking_status}'. Run /process first."
            ),
        )

    chunks_stmt = (
        select(PaperChunk)
        .where(PaperChunk.paper_id == paper.id)
        .order_by(PaperChunk.chunk_index.asc())
    )
    chunks = db.execute(chunks_stmt).scalars().all()
    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No document chunks found to vectorize. Re-run /process first.",
        )

    paper.embedding_status = "processing"
    paper.embedding_error = None
    db.commit()

    try:
        texts = [c.text for c in chunks]
        embeddings = embedding_service.embed_texts(texts)
        qdrant_service.upsert_chunks(
            user_id=paper.user_id,
            project_id=paper.project_id,
            paper_id=paper.id,
            chunks=chunks,
            embeddings=embeddings,
        )
        now = datetime.now(timezone.utc)
        paper.embedding_status = "completed"
        paper.embedded_chunk_count = len(chunks)
        paper.embedded_at = now
        paper.embedding_error = None
        db.commit()
    except Exception as exc:
        paper.embedding_status = "failed"
        paper.embedding_error = str(exc)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate embeddings and index chunks: {str(exc)}",
        )

    return PaperEmbeddingResponse(
        paper_id=paper.id,
        embedding_status="completed",
        embedded_chunk_count=len(chunks),
        embedded_at=paper.embedded_at,
        message=f"Successfully generated embeddings and indexed {len(chunks)} chunks in vector store.",
    )


@router.post(
    "/papers/{paper_id}/summary",
    response_model=PaperSummaryResponse,
    summary="Generate or regenerate a structured 6-dimensional summary for a research paper",
)
def generate_paper_summary(
    paper_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PaperSummaryResponse:
    """Generates or regenerates an evidence-grounded structured scientific summary.

    Requires chunking_status == 'completed' and embedding_status == 'completed'.
    Ownership is strictly enforced.
    """
    stmt = select(Paper).where(Paper.id == paper_id, Paper.user_id == current_user.id)
    paper = db.execute(stmt).scalar_one_or_none()
    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research paper not found.",
        )

    try:
        return paper_summary_service.generate_summary(
            paper_id=paper_id,
            user_id=current_user.id,
            db=db,
        )
    except PaperPreconditionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    except PaperSummaryError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate summary: {str(exc)}",
        )


@router.get(
    "/papers/{paper_id}/summary",
    response_model=PaperSummaryResponse,
    summary="Retrieve the existing structured summary for a research paper",
)
def get_paper_summary(
    paper_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PaperSummaryResponse:
    """Retrieves an existing structured summary for a research paper if generated."""
    stmt = select(Paper).where(Paper.id == paper_id, Paper.user_id == current_user.id)
    paper = db.execute(stmt).scalar_one_or_none()
    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research paper not found.",
        )

    summary = paper_summary_service.get_summary(
        paper_id=paper_id,
        user_id=current_user.id,
        db=db,
    )
    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No summary has been generated for this paper yet.",
        )
    return summary

