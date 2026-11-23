from fastapi import APIRouter, Response, status
from app.schemas.health import HealthResponse, DatabaseHealthResponse, GroqHealthResponse
from app.db.health import check_db_connectivity
from app.services.llm.service import llm_service

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


@router.get("/health/groq", response_model=GroqHealthResponse)
async def get_groq_health() -> GroqHealthResponse:
    """Check Groq LLM configuration and readiness status without making expensive generation calls."""
    stat = llm_service.get_status()
    return GroqHealthResponse(
        status="healthy" if stat["configured"] else "unconfigured",
        provider=stat["provider"],
        model=stat["model"],
        configured=stat["configured"],
        state=stat["status"],
        message=stat["message"],
    )
