from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint():
    """Verify existing GET /api/health contract (Iteration 0.1/0.2) remains intact."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "ResearchSphere AI API"


def test_root_endpoint():
    """Verify root GET / returns 200 with service information."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "ResearchSphere AI API"
    assert data["status"] == "online"
    assert "health" in data


def test_database_health_connected_mock():
    """Verify GET /api/health/database returns HTTP 200 when connectivity check passes."""
    with patch("app.api.routes.health.check_db_connectivity", return_value=True):
        response = client.get("/api/health/database")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"


def test_database_health_unavailable_mock():
    """Verify GET /api/health/database returns HTTP 503 without leaking credentials or tracebacks."""
    with patch("app.api.routes.health.check_db_connectivity", return_value=False):
        response = client.get("/api/health/database")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unhealthy"
        assert data["database"] == "unavailable"
        assert "password" not in response.text.lower()
        assert "traceback" not in response.text.lower()


def test_check_db_connectivity_failure_safety():
    """Verify check_db_connectivity returns False gracefully when engine connection fails."""
    from app.db.health import check_db_connectivity
    with patch("app.db.health.engine.connect", side_effect=Exception("Simulated connection failure")):
        is_connected = check_db_connectivity()
        assert is_connected is False


def test_real_postgresql_connectivity():
    """Integration test: validates real SELECT 1 against running PostgreSQL."""
    from app.db.health import check_db_connectivity
    assert check_db_connectivity() is True


def test_real_database_health_endpoint():
    """Integration test: validates real GET /api/health/database returns 200 and connected."""
    response = client.get("/api/health/database")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"
