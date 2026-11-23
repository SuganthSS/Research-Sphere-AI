import os
import re
import urllib.parse
from pathlib import Path
from dotenv import load_dotenv
from pydantic import BaseModel, Field

# Automatically load environment variables from backend/.env if present
_env_file = Path(__file__).resolve().parent.parent.parent / ".env"
if _env_file.is_file():
    load_dotenv(_env_file)


def _normalize_database_url(url: str) -> str:
    """Safely normalizes DATABASE_URL by percent-encoding passwords with special characters (like @).

    Preserves driver, host, port, database, and credentials without altering or exposing them.
    """
    if not url:
        return url

    pattern = r"^(?P<prefix>[a-zA-Z0-9_+]+://)(?P<user>[^:]+):(?P<password>.+)@(?P<host>[^@:]+)(?::(?P<port>\d+))?/(?P<db>[^?]+)(?P<query>\?.*)?$"
    match = re.match(pattern, url)
    if match:
        prefix = match.group("prefix")
        user = match.group("user")
        raw_password = match.group("password")
        host = match.group("host")
        port = f":{match.group('port')}" if match.group("port") else ""
        db = match.group("db")
        query = match.group("query") or ""

        unquoted = urllib.parse.unquote(raw_password)
        encoded_pass = urllib.parse.quote_plus(unquoted)
        return f"{prefix}{user}:{encoded_pass}@{host}{port}/{db}{query}"

    return url


class Settings(BaseModel):
    PROJECT_NAME: str = "ResearchSphere AI API"
    API_V1_STR: str = "/api"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # PostgreSQL configuration
    DATABASE_URL: str = Field(
        default_factory=lambda: _normalize_database_url(
            os.getenv(
                "DATABASE_URL",
                "postgresql+psycopg2://postgres:postgres@localhost:5432/researchsphere_dev",
            )
        )
    )

    # JWT Authentication configuration
    JWT_SECRET_KEY: str = Field(
        default_factory=lambda: os.getenv(
            "JWT_SECRET_KEY",
            "dev_insecure_jwt_secret_key_change_in_production_1234567890",
        )
    )
    JWT_ALGORITHM: str = Field(
        default_factory=lambda: os.getenv("JWT_ALGORITHM", "HS256")
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default_factory=lambda: int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    )

    @property
    def safe_database_info(self) -> str:
        """Returns safe representation of database connection target without credentials."""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(self.DATABASE_URL)
            host = parsed.hostname or "localhost"
            port = parsed.port or 5432
            db = parsed.path.lstrip("/") or "researchsphere_dev"
            return f"postgresql://{host}:{port}/{db}"
        except Exception:
            return "postgresql://[configured]"


settings = Settings()
