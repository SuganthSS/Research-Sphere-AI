"""FastAPI dependencies for request authentication and user resolution."""
from typing import Annotated
import uuid
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User

# HTTPBearer extracts Authorization: Bearer <token>
security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    """Validates the JWT access token and resolves the authenticated User from PostgreSQL.

    - Reads Authorization: Bearer <token> header.
    - Validates signature and expiration.
    - Extracts subject user UUID.
    - Queries PostgreSQL for user existence.
    - Raises 401 Unauthorized for missing, malformed, expired, or invalid credentials.
    - Never leaks internal exceptions or database details.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    try:
        payload = decode_access_token(token)
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token claims.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user_id = uuid.UUID(str(sub))
    except (jwt.PyJWTError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    stmt = select(User).where(User.id == user_id)
    user = db.execute(stmt).scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or credentials revoked.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user
