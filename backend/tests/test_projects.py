"""Comprehensive tests for Project management and ownership isolation."""
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.db.session import SessionLocal
from app.models.user import User
from app.models.project import Project

client = TestClient(app)


def create_authenticated_user(name: str = "Dr. Project Researcher") -> tuple[dict, str, uuid.UUID]:
    """Helper to register and login a test researcher, returning (user_dict, jwt_token, user_uuid)."""
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    password = "StrongPassword2026!"

    reg_res = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": password},
    )
    assert reg_res.status_code == 201
    user_data = reg_res.json()
    user_id = uuid.UUID(user_data["id"])

    login_res = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    return user_data, token, user_id


@pytest.fixture(autouse=True)
def cleanup_projects_and_users():
    """Clean up test users and projects after each test."""
    yield
    db = SessionLocal()
    try:
        stmt = select(User).where(User.email.like("test_%@example.com"))
        users = db.execute(stmt).scalars().all()
        for u in users:
            db.delete(u)
        db.commit()
    finally:
        db.close()


def test_authenticated_project_create():
    """Test authenticated project creation returning 201 Created and correct project structure."""
    _, token, user_id = create_authenticated_user()
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "name": "GraphRAG Literature Review",
        "description": "Investigating graph-enhanced retrieval for scientific literature analysis.",
    }

    res = client.post("/api/projects", json=payload, headers=headers)
    assert res.status_code == 201
    data = res.json()
    assert "id" in data
    assert data["user_id"] == str(user_id)
    assert data["name"] == "GraphRAG Literature Review"
    assert data["description"] == "Investigating graph-enhanced retrieval for scientific literature analysis."
    assert "created_at" in data
    assert "updated_at" in data


def test_unauthenticated_project_create_rejected():
    """Test that creating a project without credentials returns 401 Unauthorized."""
    payload = {"name": "Unauthenticated Project"}
    res = client.post("/api/projects", json=payload)
    assert res.status_code == 401


def test_project_persists_in_database():
    """Test that newly created project is persisted in real PostgreSQL."""
    _, token, user_id = create_authenticated_user()
    headers = {"Authorization": f"Bearer {token}"}

    res = client.post("/api/projects", json={"name": "Persistent BioProject"}, headers=headers)
    assert res.status_code == 201
    project_id = uuid.UUID(res.json()["id"])

    db = SessionLocal()
    try:
        proj = db.execute(select(Project).where(Project.id == project_id)).scalar_one_or_none()
        assert proj is not None
        assert proj.name == "Persistent BioProject"
        assert proj.user_id == user_id
    finally:
        db.close()


def test_list_projects_returns_only_owned():
    """Test that GET /api/projects returns all and only projects owned by authenticated user."""
    _, token_a, _ = create_authenticated_user("User A")
    _, token_b, _ = create_authenticated_user("User B")

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User A creates 2 projects
    client.post("/api/projects", json={"name": "Project A1"}, headers=headers_a)
    client.post("/api/projects", json={"name": "Project A2"}, headers=headers_a)

    # User B creates 1 project
    client.post("/api/projects", json={"name": "Project B1"}, headers=headers_b)

    # List for User A
    res_a = client.get("/api/projects", headers=headers_a)
    assert res_a.status_code == 200
    data_a = res_a.json()
    assert data_a["total"] == 2
    assert len(data_a["projects"]) == 2
    names_a = [p["name"] for p in data_a["projects"]]
    assert "Project A1" in names_a
    assert "Project A2" in names_a
    assert "Project B1" not in names_a

    # List for User B
    res_b = client.get("/api/projects", headers=headers_b)
    assert res_b.status_code == 200
    data_b = res_b.json()
    assert data_b["total"] == 1
    assert data_b["projects"][0]["name"] == "Project B1"


def test_get_project_by_id():
    """Test retrieving an owned project by ID."""
    _, token, _ = create_authenticated_user()
    headers = {"Authorization": f"Bearer {token}"}

    create_res = client.post(
        "/api/projects",
        json={"name": "Target Project", "description": "Details here"},
        headers=headers,
    )
    project_id = create_res.json()["id"]

    res = client.get(f"/api/projects/{project_id}", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == project_id
    assert data["name"] == "Target Project"
    assert data["description"] == "Details here"


def test_get_foreign_project_rejected():
    """Test that retrieving another user's project returns 404 Not Found (safe, non-leaking)."""
    _, token_a, _ = create_authenticated_user("User A")
    _, token_b, _ = create_authenticated_user("User B")

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    create_res = client.post("/api/projects", json={"name": "Secret Project A"}, headers=headers_a)
    project_id_a = create_res.json()["id"]

    # User B attempts to access User A's project
    res_b = client.get(f"/api/projects/{project_id_a}", headers=headers_b)
    assert res_b.status_code == 404
    assert res_b.json()["detail"] == "Project not found."


def test_update_owned_project():
    """Test updating name and description of an owned project."""
    _, token, _ = create_authenticated_user()
    headers = {"Authorization": f"Bearer {token}"}

    create_res = client.post(
        "/api/projects",
        json={"name": "Initial Name", "description": "Initial desc"},
        headers=headers,
    )
    project_id = create_res.json()["id"]

    patch_res = client.patch(
        f"/api/projects/{project_id}",
        json={"name": "GraphRAG Research Analysis", "description": "Updated desc"},
        headers=headers,
    )
    assert patch_res.status_code == 200
    data = patch_res.json()
    assert data["name"] == "GraphRAG Research Analysis"
    assert data["description"] == "Updated desc"


def test_update_foreign_project_rejected():
    """Test that User B cannot update User A's project."""
    _, token_a, _ = create_authenticated_user("User A")
    _, token_b, _ = create_authenticated_user("User B")

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    create_res = client.post("/api/projects", json={"name": "User A Project"}, headers=headers_a)
    project_id_a = create_res.json()["id"]

    patch_res = client.patch(
        f"/api/projects/{project_id_a}",
        json={"name": "Hacked Name"},
        headers=headers_b,
    )
    assert patch_res.status_code == 404


def test_delete_owned_project():
    """Test deleting an owned project returns 204 No Content and removes it."""
    _, token, _ = create_authenticated_user()
    headers = {"Authorization": f"Bearer {token}"}

    create_res = client.post("/api/projects", json={"name": "To Delete"}, headers=headers)
    project_id = create_res.json()["id"]

    del_res = client.delete(f"/api/projects/{project_id}", headers=headers)
    assert del_res.status_code == 204

    # Verify not found on subsequent get
    get_res = client.get(f"/api/projects/{project_id}", headers=headers)
    assert get_res.status_code == 404

    # Verify list is empty
    list_res = client.get("/api/projects", headers=headers)
    assert list_res.json()["total"] == 0


def test_delete_foreign_project_rejected():
    """Test that User B cannot delete User A's project."""
    _, token_a, _ = create_authenticated_user("User A")
    _, token_b, _ = create_authenticated_user("User B")

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    create_res = client.post("/api/projects", json={"name": "User A Shielded"}, headers=headers_a)
    project_id_a = create_res.json()["id"]

    del_res = client.delete(f"/api/projects/{project_id_a}", headers=headers_b)
    assert del_res.status_code == 404

    # Confirm it still exists for User A
    get_res = client.get(f"/api/projects/{project_id_a}", headers=headers_a)
    assert get_res.status_code == 200


def test_invalid_uuid_handling():
    """Test invalid UUID syntax returns 422 Unprocessable Entity."""
    _, token, _ = create_authenticated_user()
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/projects/not-a-valid-uuid", headers=headers)
    assert res.status_code == 422


def test_blank_or_whitespace_name_rejected():
    """Test that blank or whitespace-only project name returns 422."""
    _, token, _ = create_authenticated_user()
    headers = {"Authorization": f"Bearer {token}"}

    res_empty = client.post("/api/projects", json={"name": ""}, headers=headers)
    assert res_empty.status_code == 422

    res_spaces = client.post("/api/projects", json={"name": "   "}, headers=headers)
    assert res_spaces.status_code == 422


def test_max_length_name_rejected():
    """Test exceeding 255 character limit returns 422."""
    _, token, _ = create_authenticated_user()
    headers = {"Authorization": f"Bearer {token}"}

    long_name = "A" * 256
    res = client.post("/api/projects", json={"name": long_name}, headers=headers)
    assert res.status_code == 422


def test_user_deletion_cascades_to_projects():
    """Test that deleting a user cascades and deletes all associated projects."""
    _, token, user_id = create_authenticated_user()
    headers = {"Authorization": f"Bearer {token}"}

    create_res = client.post("/api/projects", json={"name": "Cascade Test"}, headers=headers)
    project_id = uuid.UUID(create_res.json()["id"])

    db = SessionLocal()
    try:
        user = db.execute(select(User).where(User.id == user_id)).scalar_one()
        db.delete(user)
        db.commit()

        # Check project is also gone
        proj = db.execute(select(Project).where(Project.id == project_id)).scalar_one_or_none()
        assert proj is None
    finally:
        db.close()
