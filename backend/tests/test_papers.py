"""Comprehensive tests for Paper ingestion, validation, storage, and ownership isolation."""
import io
import uuid
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.user import User
from app.models.project import Project
from app.models.paper import Paper
from app.services.paper_storage import paper_storage

client = TestClient(app)

VALID_PDF_BYTES = b"%PDF-1.5\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Count 1\n/Kids [3 0 R]\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000015 00000 n \n0000000068 00000 n \n0000000125 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n193\n%%EOF"


def create_authenticated_user(name: str = "Dr. Paper Researcher") -> tuple[dict, str, uuid.UUID]:
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


def create_test_project(token: str, name: str = "Biomedical Literature Project") -> dict:
    """Helper to create a project for testing."""
    headers = {"Authorization": f"Bearer {token}"}
    res = client.post(
        "/api/projects",
        headers=headers,
        json={"name": name, "description": "Research project description."},
    )
    assert res.status_code == 201
    return res.json()


@pytest.fixture(autouse=True)
def cleanup_papers_and_users():
    """Clean up test users, projects, papers, and files after each test."""
    yield
    db = SessionLocal()
    try:
        stmt = select(User).where(User.email.like("test_%@example.com"))
        users = db.execute(stmt).scalars().all()
        for u in users:
            # Delete stored files for user's papers
            for p in u.papers:
                paper_storage.delete(p.stored_filename)
            db.delete(u)
        db.commit()
    finally:
        db.close()


def test_authenticated_pdf_upload_success():
    """Test successful PDF upload to an owned project returning 201 and PaperResponse."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)
    project_id = project["id"]

    headers = {"Authorization": f"Bearer {token}"}
    files = {
        "file": ("attention_is_all_you_need.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")
    }

    res = client.post(f"/api/projects/{project_id}/papers", headers=headers, files=files)
    assert res.status_code == 201
    data = res.json()

    assert data["title"] == "attention is all you need"
    assert data["original_filename"] == "attention_is_all_you_need.pdf"
    assert data["file_size"] == len(VALID_PDF_BYTES)
    assert data["mime_type"] == "application/pdf"
    assert data["status"] == "uploaded"
    assert data["project_id"] == project_id
    assert data["project_name"] == project["name"]


def test_unauthenticated_upload_rejected():
    """Test that uploading without authentication returns 401 Unauthorized."""
    fake_project_id = uuid.uuid4()
    files = {
        "file": ("paper.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")
    }
    res = client.post(f"/api/projects/{fake_project_id}/papers", files=files)
    assert res.status_code == 401


def test_upload_to_foreign_project_rejected():
    """Test that User B cannot upload to User A's project (returns 404)."""
    _, token_a, _ = create_authenticated_user("User A")
    project_a = create_test_project(token_a)

    _, token_b, _ = create_authenticated_user("User B")
    headers_b = {"Authorization": f"Bearer {token_b}"}
    files = {
        "file": ("foreign_paper.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")
    }

    res = client.post(
        f"/api/projects/{project_a['id']}/papers",
        headers=headers_b,
        files=files,
    )
    assert res.status_code == 404


def test_upload_non_pdf_extension_rejected():
    """Test that uploading a file without .pdf extension returns 400 Bad Request."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)
    headers = {"Authorization": f"Bearer {token}"}

    files = {
        "file": ("notes.txt", io.BytesIO(b"Hello text file"), "text/plain")
    }
    res = client.post(f"/api/projects/{project['id']}/papers", headers=headers, files=files)
    assert res.status_code == 400
    assert "Only PDF documents" in res.json()["detail"]


def test_upload_empty_pdf_rejected():
    """Test that an empty 0-byte file is rejected with 400 Bad Request."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)
    headers = {"Authorization": f"Bearer {token}"}

    files = {
        "file": ("empty.pdf", io.BytesIO(b""), "application/pdf")
    }
    res = client.post(f"/api/projects/{project['id']}/papers", headers=headers, files=files)
    assert res.status_code == 400
    assert "0 bytes" in res.json()["detail"]


def test_upload_invalid_magic_bytes_rejected():
    """Test that a file renamed to .pdf without %PDF- magic bytes is rejected with 400."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)
    headers = {"Authorization": f"Bearer {token}"}

    files = {
        "file": ("fake.pdf", io.BytesIO(b"Not a real PDF file content"), "application/pdf")
    }
    res = client.post(f"/api/projects/{project['id']}/papers", headers=headers, files=files)
    assert res.status_code == 400
    assert "missing '%PDF-'" in res.json()["detail"]


def test_upload_oversized_pdf_rejected(monkeypatch):
    """Test that uploading a file exceeding max size is rejected with 400."""
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_BYTES", 100)  # Low limit for testing
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)
    headers = {"Authorization": f"Bearer {token}"}

    large_pdf = VALID_PDF_BYTES * 2
    files = {
        "file": ("large.pdf", io.BytesIO(large_pdf), "application/pdf")
    }
    res = client.post(f"/api/projects/{project['id']}/papers", headers=headers, files=files)
    assert res.status_code == 400
    assert "maximum allowed" in res.json()["detail"]


def test_paper_database_and_storage_persistence():
    """Test that uploading creates a PostgreSQL Paper row and a stored file on disk."""
    _, token, user_id = create_authenticated_user()
    project = create_test_project(token)
    headers = {"Authorization": f"Bearer {token}"}

    files = {
        "file": ("geometric_deep_learning.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")
    }
    res = client.post(f"/api/projects/{project['id']}/papers", headers=headers, files=files)
    assert res.status_code == 201
    paper_id = uuid.UUID(res.json()["id"])

    # Verify directly in PostgreSQL
    db = SessionLocal()
    try:
        paper = db.execute(select(Paper).where(Paper.id == paper_id)).scalar_one_or_none()
        assert paper is not None
        assert paper.user_id == user_id
        assert paper.project_id == uuid.UUID(project["id"])
        assert paper.status == "uploaded"

        # Verify physical file exists on disk
        stored_path = paper_storage.get_path(paper.stored_filename)
        assert stored_path is not None
        assert stored_path.is_file()
        assert stored_path.read_bytes() == VALID_PDF_BYTES
    finally:
        db.close()


def test_list_project_papers_ownership():
    """Test listing papers in a project only returns papers owned by the current user."""
    _, token_a, _ = create_authenticated_user("User A")
    project_a = create_test_project(token_a)
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Upload 2 papers for User A
    client.post(
        f"/api/projects/{project_a['id']}/papers",
        headers=headers_a,
        files={"file": ("paper1.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
    )
    client.post(
        f"/api/projects/{project_a['id']}/papers",
        headers=headers_a,
        files={"file": ("paper2.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
    )

    # User A lists project papers
    list_res = client.get(f"/api/projects/{project_a['id']}/papers", headers=headers_a)
    assert list_res.status_code == 200
    assert list_res.json()["total"] == 2

    # User B attempts to list User A's project papers -> 404
    _, token_b, _ = create_authenticated_user("User B")
    headers_b = {"Authorization": f"Bearer {token_b}"}
    res_b = client.get(f"/api/projects/{project_a['id']}/papers", headers=headers_b)
    assert res_b.status_code == 404


def test_list_all_papers_global():
    """Test listing all user papers across projects with proper project names."""
    _, token, _ = create_authenticated_user()
    p1 = create_test_project(token, "Project Alpha")
    p2 = create_test_project(token, "Project Beta")
    headers = {"Authorization": f"Bearer {token}"}

    client.post(
        f"/api/projects/{p1['id']}/papers",
        headers=headers,
        files={"file": ("alpha_paper.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
    )
    client.post(
        f"/api/projects/{p2['id']}/papers",
        headers=headers,
        files={"file": ("beta_paper.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
    )

    res = client.get("/api/papers", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    names = {p["project_name"] for p in data["papers"]}
    assert "Project Alpha" in names
    assert "Project Beta" in names


def test_get_paper_by_id_owner_and_isolation():
    """Test retrieving paper details by ID returns 200 for owner, 404 for foreign user."""
    _, token_a, _ = create_authenticated_user("User A")
    project_a = create_test_project(token_a)
    headers_a = {"Authorization": f"Bearer {token_a}"}

    upload_res = client.post(
        f"/api/projects/{project_a['id']}/papers",
        headers=headers_a,
        files={"file": ("research.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
    )
    paper_id = upload_res.json()["id"]

    # Owner gets 200
    res_a = client.get(f"/api/papers/{paper_id}", headers=headers_a)
    assert res_a.status_code == 200
    assert res_a.json()["id"] == paper_id

    # Foreign user gets 404
    _, token_b, _ = create_authenticated_user("User B")
    headers_b = {"Authorization": f"Bearer {token_b}"}
    res_b = client.get(f"/api/papers/{paper_id}", headers=headers_b)
    assert res_b.status_code == 404


def test_download_paper_file_owner_and_isolation():
    """Test downloading the original PDF succeeds for owner and returns 404 for foreign user."""
    _, token_a, _ = create_authenticated_user("User A")
    project_a = create_test_project(token_a)
    headers_a = {"Authorization": f"Bearer {token_a}"}

    upload_res = client.post(
        f"/api/projects/{project_a['id']}/papers",
        headers=headers_a,
        files={"file": ("original_manuscript.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
    )
    paper_id = upload_res.json()["id"]

    # Owner downloads original PDF
    res_a = client.get(f"/api/papers/{paper_id}/file", headers=headers_a)
    assert res_a.status_code == 200
    assert res_a.headers["content-type"] == "application/pdf"
    assert "original_manuscript.pdf" in res_a.headers["content-disposition"]
    assert res_a.content == VALID_PDF_BYTES

    # Foreign user gets 404
    _, token_b, _ = create_authenticated_user("User B")
    headers_b = {"Authorization": f"Bearer {token_b}"}
    res_b = client.get(f"/api/papers/{paper_id}/file", headers=headers_b)
    assert res_b.status_code == 404


def test_delete_paper_owner_success_removes_db_and_disk():
    """Test deleting paper deletes the PostgreSQL row and deletes the physical file from disk."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)
    headers = {"Authorization": f"Bearer {token}"}

    upload_res = client.post(
        f"/api/projects/{project['id']}/papers",
        headers=headers,
        files={"file": ("to_delete.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
    )
    paper_id = upload_res.json()["id"]

    # Verify physical file exists before delete
    db = SessionLocal()
    try:
        paper = db.execute(select(Paper).where(Paper.id == uuid.UUID(paper_id))).scalar_one()
        stored_path = paper_storage.get_path(paper.stored_filename)
        assert stored_path is not None and stored_path.is_file()
    finally:
        db.close()

    # Delete paper
    del_res = client.delete(f"/api/papers/{paper_id}", headers=headers)
    assert del_res.status_code == 204

    # Verify removed from database
    db = SessionLocal()
    try:
        paper_check = db.execute(select(Paper).where(Paper.id == uuid.UUID(paper_id))).scalar_one_or_none()
        assert paper_check is None
    finally:
        db.close()

    # Verify removed from physical storage
    assert not stored_path.is_file()


def test_delete_foreign_paper_rejected():
    """Test that User B cannot delete User A's paper (returns 404)."""
    _, token_a, _ = create_authenticated_user("User A")
    project_a = create_test_project(token_a)
    headers_a = {"Authorization": f"Bearer {token_a}"}

    upload_res = client.post(
        f"/api/projects/{project_a['id']}/papers",
        headers=headers_a,
        files={"file": ("protected.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
    )
    paper_id = upload_res.json()["id"]

    _, token_b, _ = create_authenticated_user("User B")
    headers_b = {"Authorization": f"Bearer {token_b}"}

    del_res = client.delete(f"/api/papers/{paper_id}", headers=headers_b)
    assert del_res.status_code == 404

    # Confirm paper still exists for User A
    check_res = client.get(f"/api/papers/{paper_id}", headers=headers_a)
    assert check_res.status_code == 200


def test_project_deletion_cascades_to_papers():
    """Test that deleting a project cascades to delete its papers in PostgreSQL."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)
    project_id = project["id"]
    headers = {"Authorization": f"Bearer {token}"}

    upload_res = client.post(
        f"/api/projects/{project_id}/papers",
        headers=headers,
        files={"file": ("cascade_test.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
    )
    paper_id = upload_res.json()["id"]

    # Delete the project
    del_proj_res = client.delete(f"/api/projects/{project_id}", headers=headers)
    assert del_proj_res.status_code == 204

    # Verify paper is deleted in PostgreSQL via CASCADE
    db = SessionLocal()
    try:
        paper_check = db.execute(select(Paper).where(Paper.id == uuid.UUID(paper_id))).scalar_one_or_none()
        assert paper_check is None
    finally:
        db.close()
