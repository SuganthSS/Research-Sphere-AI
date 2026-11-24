"""Targeted tests for Paper deletion: cascades, ownership isolation, Qdrant & Neo4j cleanup."""
import io
import uuid
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.db.session import SessionLocal
from app.models.user import User
from app.models.project import Project
from app.models.paper import Paper
from app.models.paper_page import PaperPage
from app.models.paper_chunk import PaperChunk
from app.models.paper_summary import PaperSummary
from app.models.paper_graph import PaperGraph
from app.services.paper_storage import paper_storage

client = TestClient(app)

VALID_PDF_BYTES = (
    b"%PDF-1.5\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n"
    b"2 0 obj\n<<\n/Type /Pages\n/Count 1\n/Kids [3 0 R]\n>>\nendobj\n"
    b"3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\n"
    b"xref\n0 4\n0000000000 65535 f \n0000000015 00000 n \n0000000068 00000 n \n0000000125 00000 n \n"
    b"trailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n193\n%%EOF"
)


def create_user_and_project() -> tuple[dict, str, uuid.UUID, str]:
    """Helper to create user and project, returning (user_dict, token, user_id, project_id)."""
    email = f"delete_test_{uuid.uuid4().hex[:8]}@example.com"
    password = "StrongPassword2026!"

    reg_res = client.post(
        "/api/auth/register",
        json={"name": "Dr. Deletion Tester", "email": email, "password": password},
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

    headers = {"Authorization": f"Bearer {token}"}
    proj_res = client.post(
        "/api/projects",
        headers=headers,
        json={"name": "Deletion Test Project", "description": "Testing cascade deletion."},
    )
    assert proj_res.status_code == 201
    project_id = proj_res.json()["id"]

    return user_data, token, user_id, project_id


def upload_test_paper(token: str, project_id: str, title: str = "Test Paper") -> dict:
    """Upload a test PDF paper."""
    headers = {"Authorization": f"Bearer {token}"}
    file_tuple = ("test_document.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")
    res = client.post(
        f"/api/projects/{project_id}/papers",
        headers=headers,
        files={"file": file_tuple},
    )
    assert res.status_code == 201
    return res.json()


def test_delete_paper_success_status_code_204():
    """Owner can delete a paper and receives HTTP 204."""
    _, token, _, project_id = create_user_and_project()
    paper = upload_test_paper(token, project_id)
    paper_id = paper["id"]

    headers = {"Authorization": f"Bearer {token}"}
    res = client.delete(f"/api/papers/{paper_id}", headers=headers)
    assert res.status_code == 204

    # Verify paper is gone from DB
    db = SessionLocal()
    try:
        found = db.execute(select(Paper).where(Paper.id == uuid.UUID(paper_id))).scalar_one_or_none()
        assert found is None
    finally:
        db.close()


def test_delete_nonexistent_paper_returns_404():
    """Deleting a non-existent paper returns 404."""
    _, token, _, _ = create_user_and_project()
    fake_id = str(uuid.uuid4())
    headers = {"Authorization": f"Bearer {token}"}
    res = client.delete(f"/api/papers/{fake_id}", headers=headers)
    assert res.status_code == 404
    assert res.json()["detail"] == "Research paper not found."


def test_delete_other_user_paper_returns_404_and_preserves_paper():
    """Non-owner receives 404 and cannot delete another user's paper."""
    _, token_owner, _, project_id = create_user_and_project()
    _, token_stranger, _, _ = create_user_and_project()

    paper = upload_test_paper(token_owner, project_id)
    paper_id = paper["id"]

    # Stranger tries to delete
    headers = {"Authorization": f"Bearer {token_stranger}"}
    res = client.delete(f"/api/papers/{paper_id}", headers=headers)
    assert res.status_code == 404

    # Paper still exists
    db = SessionLocal()
    try:
        found = db.execute(select(Paper).where(Paper.id == uuid.UUID(paper_id))).scalar_one_or_none()
        assert found is not None
    finally:
        db.close()


def test_delete_paper_cascades_pages_chunks_summaries_graphs():
    """Deleting a paper cleans up pages, chunks, summaries, and paper_graphs without ForeignKey/NotNull error."""
    _, token, user_id, project_id = create_user_and_project()
    paper = upload_test_paper(token, project_id)
    paper_uuid = uuid.UUID(paper["id"])

    db = SessionLocal()
    try:
        # Create PaperPage
        page = PaperPage(
            paper_id=paper_uuid,
            page_number=1,
            text="Page 1 sample content for deletion testing.",
            character_count=42,
        )
        db.add(page)

        # Create PaperChunk
        chunk = PaperChunk(
            paper_id=paper_uuid,
            chunk_index=0,
            text="Chunk 0 sample content.",
            start_page=1,
            end_page=1,
            character_count=23,
        )
        db.add(chunk)

        # Create PaperSummary
        summary = PaperSummary(
            paper_id=paper_uuid,
            summary_data={
                "executive_summary": "Test summary",
                "core_methodology": "Test method",
                "key_findings": ["Finding 1"],
                "limitations": ["Limitation 1"],
                "evidence_citations": [],
            },
        )
        db.add(summary)

        # Create PaperGraph (the critical table that was failing!)
        graph = PaperGraph(
            paper_id=paper_uuid,
            graph_data={
                "nodes": [{"id": f"paper_{paper_uuid}", "name": "Test Paper", "label": "Paper"}],
                "edges": [],
            },
        )
        db.add(graph)
        db.commit()

        # Verify all 4 dependent records exist before deletion
        assert db.execute(select(PaperPage).where(PaperPage.paper_id == paper_uuid)).scalars().first() is not None
        assert db.execute(select(PaperChunk).where(PaperChunk.paper_id == paper_uuid)).scalars().first() is not None
        assert db.execute(select(PaperSummary).where(PaperSummary.paper_id == paper_uuid)).scalar_one_or_none() is not None
        assert db.execute(select(PaperGraph).where(PaperGraph.paper_id == paper_uuid)).scalar_one_or_none() is not None
    finally:
        db.close()

    # Perform DELETE via API
    headers = {"Authorization": f"Bearer {token}"}
    res = client.delete(f"/api/papers/{paper['id']}", headers=headers)
    assert res.status_code == 204, f"Expected 204, got {res.status_code}: {res.text}"

    # Verify all dependent records are deleted
    db = SessionLocal()
    try:
        assert db.execute(select(Paper).where(Paper.id == paper_uuid)).scalar_one_or_none() is None
        assert db.execute(select(PaperPage).where(PaperPage.paper_id == paper_uuid)).scalars().first() is None
        assert db.execute(select(PaperChunk).where(PaperChunk.paper_id == paper_uuid)).scalars().first() is None
        assert db.execute(select(PaperSummary).where(PaperSummary.paper_id == paper_uuid)).scalar_one_or_none() is None
        assert db.execute(select(PaperGraph).where(PaperGraph.paper_id == paper_uuid)).scalar_one_or_none() is None
    finally:
        db.close()


def test_delete_paper_invokes_qdrant_and_neo4j_cleanup():
    """Deleting a paper calls Qdrant and Neo4j deletion methods."""
    _, token, _, project_id = create_user_and_project()
    paper = upload_test_paper(token, project_id)
    paper_uuid = uuid.UUID(paper["id"])

    with patch("app.api.routes.papers.qdrant_service.delete_paper_vectors") as mock_qdrant, \
         patch("app.api.routes.papers.neo4j_service.delete_paper_subgraph") as mock_neo4j:
        headers = {"Authorization": f"Bearer {token}"}
        res = client.delete(f"/api/papers/{paper['id']}", headers=headers)
        assert res.status_code == 204

        mock_qdrant.assert_called_once_with(paper_uuid)
        mock_neo4j.assert_called_once_with(str(paper_uuid))


def test_delete_paper_removes_physical_file():
    """Deleting a paper deletes its stored PDF file from filesystem."""
    _, token, _, project_id = create_user_and_project()
    paper = upload_test_paper(token, project_id)
    paper_uuid = uuid.UUID(paper["id"])

    # Query DB to get stored_filename
    db = SessionLocal()
    try:
        p_row = db.execute(select(Paper).where(Paper.id == paper_uuid)).scalar_one()
        stored_filename = p_row.stored_filename
    finally:
        db.close()

    # Verify file exists on storage
    file_path = paper_storage.get_path(stored_filename)
    assert file_path is not None

    headers = {"Authorization": f"Bearer {token}"}
    res = client.delete(f"/api/papers/{paper['id']}", headers=headers)
    assert res.status_code == 204

    # Verify file no longer exists
    assert paper_storage.get_path(stored_filename) is None


def test_delete_paper_preserves_unrelated_papers_in_same_project():
    """Deleting one paper leaves all other papers in the same project untouched."""
    _, token, _, project_id = create_user_and_project()
    paper1 = upload_test_paper(token, project_id, title="Paper 1")
    paper2 = upload_test_paper(token, project_id, title="Paper 2")

    headers = {"Authorization": f"Bearer {token}"}
    res = client.delete(f"/api/papers/{paper1['id']}", headers=headers)
    assert res.status_code == 204

    # Verify paper 1 is deleted and paper 2 remains
    db = SessionLocal()
    try:
        p1 = db.execute(select(Paper).where(Paper.id == uuid.UUID(paper1["id"]))).scalar_one_or_none()
        p2 = db.execute(select(Paper).where(Paper.id == uuid.UUID(paper2["id"]))).scalar_one_or_none()
        assert p1 is None
        assert p2 is not None
        assert p2.title == "Test Document" or "test_document" in p2.original_filename
    finally:
        db.close()
