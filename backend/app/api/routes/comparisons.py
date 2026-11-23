"""Paper comparison API endpoints for multi-paper comparative analysis."""
import uuid
from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.comparison import (
    ComparePapersRequest,
    PaperComparisonResponse,
)
from app.services.paper_comparison_service import (
    PaperComparisonError,
    PaperComparisonPreconditionError,
    paper_comparison_service,
)

router = APIRouter()


@router.post(
    "/comparisons",
    response_model=PaperComparisonResponse,
    summary="Generate or regenerate an evidence-grounded comparison across 2 to 5 research papers",
)
def create_or_regenerate_comparison(
    payload: ComparePapersRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PaperComparisonResponse:
    """Compares 2 to 5 indexed research papers across 6 scientific dimensions and synthesizes similarities/differences.

    Requires papers to be owned by the user, and chunking/semantic indexing completed.
    """
    try:
        return paper_comparison_service.compare_papers(
            user_id=current_user.id,
            paper_ids=payload.paper_ids,
            db=db,
        )
    except PaperComparisonPreconditionError as exc:
        msg = str(exc)
        if "not found" in msg.lower() or "unauthorized" in msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=msg,
            )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=msg,
        )
    except PaperComparisonError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate paper comparison: {str(exc)}",
        )


@router.get(
    "/comparisons/{comparison_id}",
    response_model=PaperComparisonResponse,
    summary="Retrieve an existing paper comparison by ID",
)
def get_comparison_by_id(
    comparison_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PaperComparisonResponse:
    """Retrieves an existing comparison result by its unique UUID. Enforces strict ownership."""
    comparison = paper_comparison_service.get_comparison_by_id(
        user_id=current_user.id,
        comparison_id=comparison_id,
        db=db,
    )
    if not comparison:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comparison not found or unauthorized access.",
        )
    return comparison


@router.get(
    "/comparisons",
    response_model=PaperComparisonResponse,
    summary="Retrieve an existing paper comparison by paper IDs",
)
def get_comparison_by_paper_ids(
    paper_ids: Annotated[List[uuid.UUID], Query(..., min_length=2, max_length=5)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PaperComparisonResponse:
    """Retrieves an existing comparison for a specific group of 2-5 papers if already generated."""
    comparison = paper_comparison_service.get_comparison(
        user_id=current_user.id,
        paper_ids=paper_ids,
        db=db,
    )
    if not comparison:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No previous comparison found for these research papers.",
        )
    return comparison
