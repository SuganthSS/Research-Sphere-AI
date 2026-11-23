"""Researcher Discovery and Collaboration API routes."""
import logging
import uuid
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.researcher import (
    ResearcherDiscoveryResponse,
    ResearcherProfile,
)
from app.services.researcher_service import researcher_discovery_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/researchers",
    response_model=ResearcherDiscoveryResponse,
    summary="Discover researchers and potential collaboration matches across user's corpus",
)
def discover_researchers(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    project_id: Optional[uuid.UUID] = Query(None, description="Optional project filter"),
) -> ResearcherDiscoveryResponse:
    """Extracts authors from the user's research corpus and suggests potential collaboration matches."""
    try:
        return researcher_discovery_service.discover_researchers(
            user_id=current_user.id,
            project_id=project_id,
            db=db,
        )
    except Exception as exc:
        logger.error("Failed to discover researchers: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Researcher discovery failed: {str(exc)}",
        )


@router.get(
    "/researchers/{author_id}",
    response_model=ResearcherProfile,
    summary="Get profile details for a specific researcher discovered in user's corpus",
)
def get_researcher_profile(
    author_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ResearcherProfile:
    """Returns detailed publication, topic, and method profile for an author in the user's corpus."""
    profile = researcher_discovery_service.get_researcher_profile(
        user_id=current_user.id,
        author_id=author_id,
        db=db,
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Researcher profile not found in your research corpus.",
        )
    return profile
