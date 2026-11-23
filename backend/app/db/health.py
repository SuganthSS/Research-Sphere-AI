"""Database connectivity check via SQLAlchemy."""
from sqlalchemy import text
from app.db.session import engine


def check_db_connectivity() -> bool:
    """Executes SELECT 1 on PostgreSQL via SQLAlchemy to verify active connection.

    Returns True if database is reachable and responds successfully,
    False if unreachable or connection fails.
    Never raises exceptions or leaks connection credentials to callers.
    """
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            scalar = result.scalar()
            return scalar == 1
    except Exception:
        return False
