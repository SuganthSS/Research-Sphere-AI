import uuid
from datetime import datetime, timezone, timedelta
import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.user import User
from app.core.security import verify_password, decode_access_token, create_access_token

client = TestClient(app)


@pytest.fixture(autouse=True)
def cleanup_test_users():
    """Ensure test users created during test execution are cleanly rolled back or removed."""
    yield
    # Clean up test accounts after test
    db = SessionLocal()
    try:
        stmt = select(User).where(User.email.like("test_%@example.com"))
        users = db.execute(stmt).scalars().all()
        for u in users:
            db.delete(u)
        db.commit()
    finally:
        db.close()


def test_successful_user_registration():
    """Test standard user registration returning 201 Created and safe user fields."""
    unique_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "name": "Dr. Marie Curie",
        "email": unique_email,
        "password": "ResearchPassword2026!",
    }

    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201

    data = response.json()
    assert "id" in data
    assert data["name"] == "Dr. Marie Curie"
    assert data["email"] == unique_email.lower()
    assert "created_at" in data
    assert "password" not in data
    assert "password_hash" not in data

    db = SessionLocal()
    try:
        user = db.execute(select(User).where(User.email == unique_email.lower())).scalar_one()
        assert user is not None
        assert user.password_hash != "ResearchPassword2026!"
        assert verify_password("ResearchPassword2026!", user.password_hash) is True
    finally:
        db.close()


def test_duplicate_email_rejected():
    """Test duplicate registration fails with 409 Conflict."""
    unique_email = f"test_dup_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "name": "Researcher One",
        "email": unique_email,
        "password": "Password12345!",
    }

    res1 = client.post("/api/auth/register", json=payload)
    assert res1.status_code == 201

    res2 = client.post("/api/auth/register", json=payload)
    assert res2.status_code == 409
    assert res2.json()["detail"] == "An account with this email already exists."


def test_invalid_email_format_rejected():
    """Test invalid email format fails server validation with 422 Unprocessable Entity."""
    payload = {
        "name": "Invalid Email User",
        "email": "not-a-valid-email",
        "password": "ValidPassword123!",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 422


def test_short_password_rejected():
    """Test passwords under 8 characters fail validation with 422."""
    payload = {
        "name": "Short Password User",
        "email": f"test_short_{uuid.uuid4().hex[:8]}@example.com",
        "password": "short",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 422


def test_blank_or_whitespace_name_rejected():
    """Test that empty or whitespace-only name fails validation."""
    payload = {
        "name": "   ",
        "email": f"test_name_{uuid.uuid4().hex[:8]}@example.com",
        "password": "ValidPassword123!",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 422


# =========================================================================
# Iteration 1.3: User Login & JWT Tests
# =========================================================================

def test_successful_user_login():
    """Test successful login with registered credentials returns JWT token and safe user info."""
    unique_email = f"test_login_{uuid.uuid4().hex[:8]}@example.com"
    password = "SecurePassword123!"

    # 1. Register user
    reg_res = client.post(
        "/api/auth/register",
        json={"name": "Dr. Richard Feynman", "email": unique_email, "password": password},
    )
    assert reg_res.status_code == 201
    user_id = reg_res.json()["id"]

    # 2. Login
    login_res = client.post(
        "/api/auth/login",
        json={"email": unique_email, "password": password},
    )
    assert login_res.status_code == 200

    data = login_res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "user" in data
    assert data["user"]["id"] == user_id
    assert data["user"]["name"] == "Dr. Richard Feynman"
    assert data["user"]["email"] == unique_email.lower()

    # Security check: never expose credentials or hashes
    assert "password" not in data
    assert "password_hash" not in data
    assert "password" not in data["user"]
    assert "password_hash" not in data["user"]


def test_login_wrong_password_rejected():
    """Test that wrong password returns generic 401 Unauthorized."""
    unique_email = f"test_wrongpw_{uuid.uuid4().hex[:8]}@example.com"
    password = "CorrectPassword123!"

    # Register user
    reg_res = client.post(
        "/api/auth/register",
        json={"name": "Test User", "email": unique_email, "password": password},
    )
    assert reg_res.status_code == 201

    # Attempt login with wrong password
    response = client.post(
        "/api/auth/login",
        json={"email": unique_email, "password": "WrongPassword999!"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."


def test_login_unknown_email_rejected():
    """Test that unknown email returns the same generic 401 Unauthorized without leaking email existence."""
    response = client.post(
        "/api/auth/login",
        json={"email": "nonexistent_researcher@example.com", "password": "AnyPassword123!"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."


def test_login_invalid_email_format():
    """Test invalid email format returns 422 Unprocessable Entity."""
    response = client.post(
        "/api/auth/login",
        json={"email": "not-an-email-format", "password": "ValidPassword123!"},
    )
    assert response.status_code == 422


def test_jwt_claims_and_expiration():
    """Test that issued JWT contains valid subject (user ID) and future expiration."""
    unique_email = f"test_jwt_{uuid.uuid4().hex[:8]}@example.com"
    password = "QuantumPassword123!"

    reg_res = client.post(
        "/api/auth/register",
        json={"name": "Niels Bohr", "email": unique_email, "password": password},
    )
    user_id = reg_res.json()["id"]

    login_res = client.post(
        "/api/auth/login",
        json={"email": unique_email, "password": password},
    )
    token = login_res.json()["access_token"]

    # Decode and verify token claims
    claims = decode_access_token(token)
    assert claims["sub"] == user_id
    assert "exp" in claims
    assert "iat" in claims

    # Expiration must be in the future
    exp_dt = datetime.fromtimestamp(claims["exp"], tz=timezone.utc)
    assert exp_dt > datetime.now(timezone.utc)


# =========================================================================
# Iteration 1.4: Authentication Verification & Protected User Dependency
# =========================================================================

def test_auth_me_with_valid_token():
    """Test GET /api/auth/me returns 200 and authenticated researcher details."""
    unique_email = f"test_me_{uuid.uuid4().hex[:8]}@example.com"
    password = "DiscoveryPassword2026!"

    reg_res = client.post(
        "/api/auth/register",
        json={"name": "Dr. Chien-Shiung Wu", "email": unique_email, "password": password},
    )
    user_id = reg_res.json()["id"]

    login_res = client.post(
        "/api/auth/login",
        json={"email": unique_email, "password": password},
    )
    token = login_res.json()["access_token"]

    # Request /api/auth/me with Bearer token
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200

    data = me_res.json()
    assert data["id"] == user_id
    assert data["name"] == "Dr. Chien-Shiung Wu"
    assert data["email"] == unique_email.lower()
    assert "created_at" in data

    # Security check: ensure passwords/hashes are not leaked
    assert "password" not in data
    assert "password_hash" not in data


def test_auth_me_missing_token():
    """Test GET /api/auth/me without Authorization header returns 401 Unauthorized."""
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers
    assert response.json()["detail"] == "Authentication credentials were not provided."


def test_auth_me_malformed_token():
    """Test GET /api/auth/me with malformed token returns 401 Unauthorized."""
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer not-a-valid-jwt-token"},
    )
    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers
    assert response.json()["detail"] == "Invalid or expired authentication token."


def test_auth_me_invalid_signature():
    """Test GET /api/auth/me with token signed by different secret returns 401 Unauthorized."""
    foreign_token = jwt.encode(
        {"sub": str(uuid.uuid4()), "exp": datetime.now(timezone.utc) + timedelta(minutes=15)},
        "completely-different-wrong-secret-key-12345",
        algorithm="HS256",
    )
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {foreign_token}"},
    )
    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers
    assert response.json()["detail"] == "Invalid or expired authentication token."


def test_auth_me_expired_token():
    """Test GET /api/auth/me with expired token returns 401 Unauthorized."""
    expired_token = create_access_token(
        subject=str(uuid.uuid4()),
        expires_delta=-timedelta(minutes=10),  # expired 10 minutes ago
    )
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers
    assert response.json()["detail"] == "Invalid or expired authentication token."


def test_auth_me_nonexistent_user():
    """Test GET /api/auth/me with valid JWT referencing a non-existent user returns 401."""
    random_user_id = str(uuid.uuid4())
    token = create_access_token(subject=random_user_id)

    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "User not found or credentials revoked."

