"""Paper recommendation API routes."""
import logging
import uuid
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.recommendation import (
    PaperRecommendationsResponse,
)
from app.services.recommendation_service import recommendation_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/recommendations/papers",
    response_model=PaperRecommendationsResponse,
    summary="Get multi-signal research paper recommendations from the user's corpus",
)
def get_paper_recommendations(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    target_paper_id: Optional[uuid.UUID] = Query(None, description="Optional target reference paper UUID"),
    project_id: Optional[uuid.UUID] = Query(None, description="Optional project scope filter"),
    limit: int = Query(5, ge=1, le=20, description="Maximum recommendations to return"),
) -> PaperRecommendationsResponse:
    """Computes transparent corpus-based paper recommendations using semantic similarity and graph overlap."""
    try:
        return recommendation_service.get_recommendations(
            user_id=current_user.id,
            target_paper_id=target_paper_id,
            project_id=project_id,
            limit=limit,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except Exception as exc:
        logger.error("Failed to generate paper recommendations: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Recommendation computation failed: {str(exc)}",
        )
