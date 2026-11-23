"""API routes for Scientific Knowledge Graph."""
import uuid
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.graph import KnowledgeGraphResponse, Neo4jStatusResponse
from app.services.knowledge_graph_service import (
    KnowledgeGraphError,
    KnowledgeGraphPreconditionError,
    knowledge_graph_service,
)
from app.services.neo4j_service import neo4j_service

router = APIRouter()


@router.get(
    "/graphs/status",
    response_model=Neo4jStatusResponse,
    summary="Check Neo4j graph database connectivity status",
)
def get_graph_database_status() -> Neo4jStatusResponse:
    """Returns safe connection state for Neo4j (Connected, Not configured, or Unavailable)."""
    return neo4j_service.get_status()


@router.post(
    "/graphs/papers/{paper_id}/generate",
    response_model=KnowledgeGraphResponse,
    summary="Generate or rebuild scientific knowledge graph for a paper",
)
def generate_paper_knowledge_graph(
    paper_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> KnowledgeGraphResponse:
    """Extracts entities and relationships for a paper and persists graph in PostgreSQL and Neo4j."""
    try:
        return knowledge_graph_service.generate_paper_graph(
            paper_id=paper_id,
            user_id=current_user.id,
            db=db,
        )
    except KnowledgeGraphPreconditionError as exc:
        msg = str(exc)
        if "not found" in msg.lower() or "unauthorized" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=msg)
    except KnowledgeGraphError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate knowledge graph: {str(exc)}",
        )


@router.get(
    "/graphs/papers/{paper_id}",
    response_model=KnowledgeGraphResponse,
    summary="Retrieve knowledge graph for a paper",
)
def get_paper_knowledge_graph(
    paper_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> KnowledgeGraphResponse:
    """Retrieves existing knowledge graph for a paper, enforcing strict ownership."""
    try:
        graph = knowledge_graph_service.get_paper_graph(
            paper_id=paper_id,
            user_id=current_user.id,
            db=db,
        )
        if not graph:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Knowledge graph has not been generated for this paper yet.",
            )
        return graph
    except KnowledgeGraphPreconditionError as exc:
        msg = str(exc)
        if "not found" in msg.lower() or "unauthorized" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=msg)
