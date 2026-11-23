from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.health import router as health_router
from app.api.routes.auth import router as auth_router
from app.api.routes.projects import router as projects_router
from app.api.routes.papers import router as papers_router
from app.api.routes.search import router as search_router
from app.api.routes.assistant import router as assistant_router
from app.api.routes.comparisons import router as comparisons_router
from app.core.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="ResearchSphere AI API - AI-Powered Scientific Research Assistant Backend",
    version="0.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS configuration to allow local frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(health_router, prefix="/api", tags=["Health"])
app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])
app.include_router(projects_router, prefix="/api/projects", tags=["Projects"])
app.include_router(papers_router, prefix="/api", tags=["Papers"])
app.include_router(search_router, prefix="/api", tags=["Search"])
app.include_router(assistant_router, prefix="/api", tags=["Assistant"])
app.include_router(comparisons_router, prefix="/api", tags=["Comparisons"])


@app.get("/", tags=["Root"])
async def root() -> dict[str, str]:
    """Root endpoint with service info and navigation links."""
    return {
        "service": settings.PROJECT_NAME,
        "status": "online",
        "docs": "/docs",
        "health": "/api/health",
        "database_health": "/api/health/database",
    }
