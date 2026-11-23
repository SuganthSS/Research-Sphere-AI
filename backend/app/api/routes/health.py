from fastapi import APIRouter, Response, status
from app.schemas.health import HealthResponse, DatabaseHealthResponse
from app.db.health import check_db_connectivity

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def get_health() -> HealthResponse:
    """Return application health status (Iteration 0.1/0.2 contract)."""
    return HealthResponse(
        status="healthy",
        service="ResearchSphere AI API",
    )


@router.get("/health/database", response_model=DatabaseHealthResponse)
async def get_database_health(response: Response) -> DatabaseHealthResponse:
    """Check PostgreSQL database connectivity via SQLAlchemy SELECT 1.

    Returns HTTP 200 with database='connected' when available,
    or HTTP 503 with database='unavailable' when database is unreachable.
    Never exposes database passwords, internal traces, or connection strings.
    """
    is_connected = check_db_connectivity()
    if is_connected:
        return DatabaseHealthResponse(
            status="healthy",
            database="connected",
        )
    else:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return DatabaseHealthResponse(
            status="unhealthy",
            database="unavailable",
        )
