from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str


class DatabaseHealthResponse(BaseModel):
    status: str
    database: str


class GroqHealthResponse(BaseModel):
    status: str
    provider: str
    model: str
    configured: bool
    state: str
    message: str
