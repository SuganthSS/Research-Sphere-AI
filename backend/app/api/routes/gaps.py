"""Research Gaps API routes."""
import logging
import uuid
from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.project import Project
from app.models.research_gap import ResearchGapAnalysis
from app.models.user import User
from app.schemas.research_gap import (
    AnalyzeResearchGapsRequest,
    PotentialResearchGap,
    ResearchGapAnalysisResponse,
    SCIENTIFIC_CAUTION_NOTICE,
)
from app.services.research_gap_service import research_gap_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/projects/{project_id}/gaps/analyze",
    response_model=ResearchGapAnalysisResponse,
    summary="Analyze potential research gaps from project or selected papers",
)
def analyze_research_gaps(
    project_id: uuid.UUID,
    payload: AnalyzeResearchGapsRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ResearchGapAnalysisResponse:
    """Infers evidence-supported potential research gaps strictly from the user's literature corpus."""
    try:
        target_paper_ids = payload.paper_ids if payload.scope == "selected" else None
        return research_gap_service.analyze_gaps(
            project_id=project_id,
            user_id=current_user.id,
            paper_ids=target_paper_ids,
            db=db,
            force_regenerate=payload.force_regenerate,
        )
    except ValueError as exc:
        msg = str(exc)
        if "not found" in msg.lower() or "denied" in msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=msg,
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg,
        )
    except Exception as exc:
        logger.error("Failed to analyze research gaps: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Research gap analysis failed: {str(exc)}",
        )


@router.get(
    "/projects/{project_id}/gaps/latest",
    response_model=ResearchGapAnalysisResponse,
    summary="Retrieve the latest research gap analysis for a project",
)
def get_latest_research_gaps(
    project_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    paper_ids: Optional[str] = Query(None, description="Optional comma-separated paper UUIDs"),
) -> ResearchGapAnalysisResponse:
    """Returns the latest stored research gap analysis for the specified project."""
    # Verify project ownership
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research project not found or access denied.",
        )

    query = db.query(ResearchGapAnalysis).filter(
        ResearchGapAnalysis.project_id == project_id,
        ResearchGapAnalysis.user_id == current_user.id,
    )

    if paper_ids:
        raw_ids = [p.strip() for p in paper_ids.split(",") if p.strip()]
        sorted_key = ",".join(sorted(raw_ids))
        query = query.filter(ResearchGapAnalysis.paper_ids_key == sorted_key)

    record = query.order_by(ResearchGapAnalysis.version.desc(), ResearchGapAnalysis.created_at.desc()).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No research gap analysis found for this project.",
        )

    parsed_gaps = [PotentialResearchGap(**g) for g in record.analysis_data.get("gaps", [])]
    return ResearchGapAnalysisResponse(
        id=record.id,
        project_id=project_id,
        paper_ids=[uuid.UUID(pid) for pid in record.paper_ids],
        gaps=parsed_gaps,
        total_gaps=len(parsed_gaps),
        insufficient_evidence=record.analysis_data.get("insufficient_evidence", False),
        insufficient_evidence_reason=record.analysis_data.get("insufficient_evidence_reason"),
        caution_notice=SCIENTIFIC_CAUTION_NOTICE,
        model_provider=record.model_provider,
        model_name=record.model_name,
        version=record.version,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )
