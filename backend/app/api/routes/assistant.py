"""AI Research Assistant API routes."""
import logging
import uuid
from typing import Annotated, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.paper import Paper
from app.models.project import Project
from app.models.user import User
from app.schemas.assistant import (
    AskAssistantRequest,
    AskAssistantResponse,
    AssistantStatusResponse,
    SourceCitationItem,
)
from app.services.embedding import embedding_service
from app.services.llm.exceptions import (
    LLMAuthenticationError,
    LLMConfigurationError,
    LLMConnectionError,
    LLMModelNotFoundError,
    LLMProviderError,
    LLMRateLimitError,
    LLMTimeoutError,
)
from app.services.llm.service import llm_service
from app.services.qdrant_service import qdrant_service
from app.services.rag_service import rag_service
from app.services.graph_rag_service import graph_rag_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/assistant/status",
    response_model=AssistantStatusResponse,
    summary="Get AI Assistant and LLM provider readiness status",
)
def get_assistant_status() -> AssistantStatusResponse:
    """Returns safe operational status of the Groq LLM provider."""
    stat = llm_service.get_status()
    return AssistantStatusResponse(
        provider=stat["provider"],
        model=stat["model"],
        configured=stat["configured"],
        status=stat["status"],
        message=stat["message"],
    )


@router.post(
    "/assistant/ask",
    response_model=AskAssistantResponse,
    summary="Ask a research question grounded in paper evidence",
)
def ask_assistant(
    request: AskAssistantRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AskAssistantResponse:
    """Answer a research question strictly grounded in retrieved paper chunks.

    Supports single-paper and project-wide scoping. Enforces strict user isolation.
    """
    question_text = request.question.strip()
    if not question_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question cannot be empty or blank.",
        )

    # 1. Scope & Preconditions Validation
    if request.scope == "paper":
        if not request.paper_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="paper_id is required when scope is 'paper'.",
            )
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
        if paper.embedding_status != "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selected paper has not been semantically indexed yet. Please create a semantic index on the paper detail page first.",
            )

    elif request.scope == "project":
        if not request.project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="project_id is required when scope is 'project'.",
            )
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
        # Verify at least one indexed paper in project
        indexed_papers_stmt = select(Paper.id).where(
            Paper.project_id == request.project_id,
            Paper.user_id == current_user.id,
            Paper.embedding_status == "completed",
        )
        has_indexed = db.execute(indexed_papers_stmt).first()
        if not has_indexed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This project does not contain any semantically indexed papers. Please upload and index at least one paper first.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported scope '{request.scope}'. Must be 'paper' or 'project'.",
        )

    # 2. Vectorize the question
    try:
        query_vector = embedding_service.embed_query(question_text)
    except Exception as exc:
        logger.error("Failed to generate question embedding: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Question vectorization failed: {str(exc)}",
        )

    # 3. Retrieve chunks from Qdrant with mandatory user isolation filter
    try:
        raw_results = qdrant_service.search(
            query_vector=query_vector,
            user_id=current_user.id,
            project_id=request.project_id,
            paper_id=request.paper_id,
            limit=settings.RAG_TOP_K,
        )
    except Exception as exc:
        logger.error("Qdrant retrieval error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Vector search service error: {str(exc)}",
        )

    # 4. Enrich search results with accurate paper titles from PostgreSQL
    paper_ids = [uuid.UUID(r["paper_id"]) for r in raw_results if r.get("paper_id")]
    title_map: Dict[str, str] = {}
    if paper_ids:
        title_stmt = select(Paper.id, Paper.title).where(Paper.id.in_(paper_ids))
        for row in db.execute(title_stmt).all():
            title_map[str(row[0])] = row[1]

    enriched_chunks = []
    for r in raw_results:
        p_id = r.get("paper_id")
        paper_title = title_map.get(str(p_id), "Research Paper")
        enriched_chunks.append({**r, "paper_title": paper_title})

    # 5. Execute Grounded RAG / GraphRAG with LLM provider
    is_graph_mode = request.mode in ("graph", "graphrag")
    try:
        if is_graph_mode:
            # Determine allowed paper IDs strictly owned by current user
            if request.scope == "paper":
                allowed_paper_ids = [str(request.paper_id)]
            else:
                project_paper_ids_stmt = select(Paper.id).where(
                    Paper.project_id == request.project_id,
                    Paper.user_id == current_user.id,
                )
                allowed_paper_ids = [str(row[0]) for row in db.execute(project_paper_ids_stmt).all()]

            output = graph_rag_service.answer_question(
                question=question_text,
                retrieved_chunks=enriched_chunks,
                allowed_paper_ids=allowed_paper_ids,
                similarity_threshold=settings.RAG_SIMILARITY_THRESHOLD,
            )
            retrieval_mode = output.retrieval_mode
            graph_context_used = output.graph_context_used
            graph_entities = output.graph_entities
            graph_relationships = output.graph_relationships
            graph_fallback = output.graph_fallback
            graph_fallback_reason = output.graph_fallback_reason
        else:
            output = rag_service.answer_question(
                question=question_text,
                retrieved_chunks=enriched_chunks,
                similarity_threshold=settings.RAG_SIMILARITY_THRESHOLD,
            )
            retrieval_mode = "standard"
            graph_context_used = False
            graph_entities = []
            graph_relationships = []
            graph_fallback = False
            graph_fallback_reason = None
    except LLMConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    except LLMAuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )
    except LLMModelNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )
    except LLMRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        )
    except LLMTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(exc),
        )
    except LLMConnectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )
    except LLMProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )
    except Exception as exc:
        logger.error("Unhandled RAG generation failure: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while generating the research answer.",
        )

    sources_out = [
        SourceCitationItem(
            source_number=s.source_number,
            paper_id=s.paper_id,
            paper_title=s.paper_title,
            chunk_id=s.chunk_id,
            chunk_index=s.chunk_index,
            section_name=s.section_name,
            start_page=s.start_page,
            end_page=s.end_page,
            similarity_score=s.similarity_score,
            text=s.text,
        )
        for s in output.sources
    ]

    return AskAssistantResponse(
        question=question_text,
        answer=output.answer,
        scope=request.scope,
        paper_id=request.paper_id,
        project_id=request.project_id,
        sources=sources_out,
        total_sources=output.total_sources,
        insufficient_evidence=output.insufficient_evidence,
        retrieval_mode=retrieval_mode,
        graph_context_used=graph_context_used,
        graph_entities=graph_entities,
        graph_relationships=graph_relationships,
        graph_fallback=graph_fallback,
        graph_fallback_reason=graph_fallback_reason,
    )
