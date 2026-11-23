"""Scholarly Paper Discovery and Open-Access Import API routes."""
import logging
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.discovery import (
    PaperDiscoverySearchResponse,
    PaperImportRequest,
    PaperImportResponse,
)
from app.services.discovery.service import paper_discovery_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/discovery/search",
    response_model=PaperDiscoverySearchResponse,
    summary="Search scholarly papers via OpenAlex academic graph",
)
def search_papers(
    current_user: Annotated[User, Depends(get_current_user)],
    query: str = Query(..., min_length=1, description="Scientific topic, title, or keyword search query"),
    limit: int = Query(10, ge=1, le=25, description="Number of results to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    open_access_only: bool = Query(True, description="Filter for open-access publications"),
    year: Optional[str] = Query(None, description="Optional publication year filter (e.g. '2024' or '2022-2024')"),
) -> PaperDiscoverySearchResponse:
    """Discovers scholarly research papers with open-access verification and direct PDF links."""
    return paper_discovery_service.search_papers(
        query=query,
        limit=limit,
        offset=offset,
        open_access_only=open_access_only,
        year=year,
    )


@router.post(
    "/discovery/import",
    response_model=PaperImportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Import an open-access paper PDF into a research project",
)
def import_paper(
    payload: PaperImportRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PaperImportResponse:
    """Safely downloads a verified open-access PDF and enrolls it into the project ingestion pipeline."""
    return paper_discovery_service.import_paper(
        user_id=current_user.id,
        import_request=payload,
        db=db,
    )
