from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import get_password_hash, verify_password, create_access_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import (
    UserRegisterRequest,
    UserLoginRequest,
    UserResponse,
    TokenResponse,
)

router = APIRouter()


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new researcher account",
)
def register_user(
    user_in: UserRegisterRequest,
    db: Session = Depends(get_db),
) -> User:
    """Registers a new user account with secure password hashing.

    - Validates name, email, and password length.
    - Rejects duplicate email registration with 409 Conflict.
    - Never stores plaintext passwords.
    - Returns safe public user info (never password or password_hash).
    """
    stmt = select(User).where(User.email == user_in.email)
    existing_user = db.execute(stmt).scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    hashed_password = get_password_hash(user_in.password)

    user = User(
        name=user_in.name,
        email=user_in.email,
        password_hash=hashed_password,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate user and issue JWT access token",
)
def login_user(
    credentials: UserLoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Authenticates researcher credentials against PostgreSQL and returns signed JWT.

    - Validates submitted email and password.
    - Employs safe generic 401 Unauthorized for unknown email or wrong password.
    - Returns signed JWT access token and safe researcher profile.
    """
    stmt = select(User).where(User.email == credentials.email)
    user = db.execute(stmt).scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(subject=str(user.id))

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify token and retrieve current authenticated researcher",
)
def get_authenticated_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Returns the authenticated user details for the caller based on their Bearer token.

    - Validates signature and expiration via get_current_user dependency.
    - Excludes password and password_hash from the response model.
    - Enables frontend server-side session verification.
    """
    return current_user

