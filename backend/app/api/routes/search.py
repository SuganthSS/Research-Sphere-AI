"""Semantic search API routes powered by SentenceTransformers and Qdrant vector database."""
import logging
import uuid
from typing import Annotated, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.paper import Paper
from app.models.project import Project
from app.models.user import User
from app.schemas.search import (
    SemanticSearchRequest,
    SemanticSearchResponse,
    SearchResultItem,
)
from app.services.embedding import embedding_service
from app.services.qdrant_service import qdrant_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/search/semantic",
    response_model=SemanticSearchResponse,
    summary="Semantic similarity search across embedded paper chunks",
)
def semantic_search(
    request: SemanticSearchRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SemanticSearchResponse:
    """Retrieve top relevant scientific paper chunks using dense vector embeddings and cosine similarity.

    Strictly scoped to papers owned by the authenticated researcher.
    Supports scoping to an entire project or an individual paper.
    """
    # 1. Validate query string
    query_text = request.query.strip()
    if not query_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search query cannot be empty or blank.",
        )

    # 2. Scope verification (ownership isolation)
    if request.project_id is not None:
        project_stmt = select(Project).where(
            Project.id == request.project_id,
            Project.user_id == current_user.id,
        )
        project = db.execute(project_stmt).scalar_one_or_none()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research project not found.",
            )

    if request.paper_id is not None:
        paper_stmt = select(Paper).where(
            Paper.id == request.paper_id,
            Paper.user_id == current_user.id,
        )
        paper = db.execute(paper_stmt).scalar_one_or_none()
        if not paper:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research paper not found.",
            )

    # 3. Vectorize query
    try:
        query_vector = embedding_service.embed_query(query_text)
    except Exception as exc:
        logger.error("Failed to generate query embedding: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query vectorization failed: {str(exc)}",
        )

    # 4. Search Qdrant with mandatory user isolation filter
    try:
        raw_results = qdrant_service.search(
            query_vector=query_vector,
            user_id=current_user.id,
            project_id=request.project_id,
            paper_id=request.paper_id,
            limit=request.limit,
        )
    except Exception as exc:
        logger.error("Qdrant search error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Vector search service error: {str(exc)}",
        )

    # 5. Enrich search results with accurate paper titles from PostgreSQL
    paper_ids = [uuid.UUID(r["paper_id"]) for r in raw_results if r.get("paper_id")]
    title_map: Dict[str, str] = {}
    if paper_ids:
        title_stmt = select(Paper.id, Paper.title).where(Paper.id.in_(paper_ids))
        for row in db.execute(title_stmt).all():
            title_map[str(row[0])] = row[1]

    items = []
    for r in raw_results:
        p_id_str = r.get("paper_id")
        paper_title = title_map.get(p_id_str, "Research Paper")
        items.append(
            SearchResultItem(
                score=r["score"],
                paper_id=uuid.UUID(p_id_str),
                paper_title=paper_title,
                project_id=uuid.UUID(r["project_id"]),
                chunk_id=uuid.UUID(r["chunk_id"]),
                chunk_index=r["chunk_index"],
                section_name=r.get("section_name") or "Unknown",
                start_page=r["start_page"],
                end_page=r["end_page"],
                text=r["text"],
                character_count=r.get("character_count", len(r["text"])),
                token_count_estimate=r.get("token_count_estimate"),
            )
        )

    return SemanticSearchResponse(
        query=query_text,
        total_results=len(items),
        results=items,
    )
