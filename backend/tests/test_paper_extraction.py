"""Comprehensive test suite for PDF text extraction and page preservation (Module 3 / Iteration 3.2)."""
import io
import uuid
import pytest
import pymupdf
from pathlib import Path
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.db.session import SessionLocal
from app.models.user import User
from app.models.project import Project
from app.models.paper import Paper
from app.models.paper_page import PaperPage
from app.services.paper_storage import paper_storage

client = TestClient(app)


def create_authenticated_user(name: str = "Dr. Extraction Tester") -> tuple[dict, str, uuid.UUID]:
    """Register and login a test user, returning (user_dict, token, user_uuid)."""
    email = f"extract_{uuid.uuid4().hex[:8]}@example.com"
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


def create_test_project(token: str, name: str = "Extraction Research Lab") -> dict:
    """Helper to create a project for testing."""
    headers = {"Authorization": f"Bearer {token}"}
    res = client.post(
        "/api/projects",
        headers=headers,
        json={"name": name, "description": "Project testing PDF page preservation."},
    )
    assert res.status_code == 201
    return res.json()


def generate_multipage_pdf(page_texts: list[str]) -> bytes:
    """Generate a valid in-memory PDF with specified text per page using pymupdf."""
    doc = pymupdf.open()
    for text in page_texts:
        page = doc.new_page()
        if text:
            page.insert_text((72, 72), text)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def upload_test_paper(token: str, project_id: str, filename: str, pdf_bytes: bytes) -> dict:
    """Helper to upload a paper to a project."""
    headers = {"Authorization": f"Bearer {token}"}
    files = {"file": (filename, io.BytesIO(pdf_bytes), "application/pdf")}
    res = client.post(f"/api/projects/{project_id}/papers", headers=headers, files=files)
    assert res.status_code == 201
    return res.json()


@pytest.fixture(autouse=True)
def cleanup_papers_and_pages():
    """Clean up test users, projects, papers, and files after each test."""
    yield
    db = SessionLocal()
    try:
        stmt = select(User).where(User.email.like("extract_%@example.com"))
        users = db.execute(stmt).scalars().all()
        for u in users:
            for p in u.papers:
                paper_storage.delete(p.stored_filename)
            db.delete(u)
        db.commit()
    finally:
        db.close()


# -------------------------------------------------------------------------
# Test Cases A-I: Extraction Core, Page Preservation, and API Endpoints
# -------------------------------------------------------------------------


def test_successful_multipage_pdf_extraction():
    """Test A: Successful extraction of a 3-page PDF returning 200 and PaperExtractionResponse."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)
    project_id = project["id"]

    pages_content = [
        "Page 1: Attention mechanisms revolutionised deep learning transformers.",
        "Page 2: Methods: We evaluated token representations across 12 layers.",
        "Page 3: Conclusion: Significant performance gains across all benchmarks.",
    ]
    pdf_bytes = generate_multipage_pdf(pages_content)
    paper = upload_test_paper(token, project_id, "transformer_study.pdf", pdf_bytes)
    paper_id = paper["id"]

    headers = {"Authorization": f"Bearer {token}"}
    res = client.post(f"/api/papers/{paper_id}/extract", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["paper_id"] == paper_id
    assert data["extraction_status"] == "completed"
    assert data["page_count"] == 3
    assert data["extracted_at"] is not None
    assert "extracted 3 pages" in data["message"].lower()


def test_page_numbering_starts_at_one_sequential():
    """Test B: Page numbers are 1-indexed (1, 2, 3), sequential, with no 0-indexing or gaps."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)
    pdf_bytes = generate_multipage_pdf(["First page text", "Second page text", "Third page text"])
    paper = upload_test_paper(token, project["id"], "numbered_doc.pdf", pdf_bytes)
    paper_id = paper["id"]

    headers = {"Authorization": f"Bearer {token}"}
    client.post(f"/api/papers/{paper_id}/extract", headers=headers)

    res = client.get(f"/api/papers/{paper_id}/pages", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["page_count"] == 3
    pages = data["pages"]
    assert len(pages) == 3

    page_numbers = [p["page_number"] for p in pages]
    assert page_numbers == [1, 2, 3]


def test_extracted_text_matches_page_contents_and_character_counts():
    """Test C & D: Extracted text per page accurately matches source content and character count."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)
    pages_content = [
        "AlphaFold 3 predicts molecular complexes with high accuracy.",
        "Protein-DNA interactions exhibit distinct conformational changes.",
    ]
    pdf_bytes = generate_multipage_pdf(pages_content)
    paper = upload_test_paper(token, project["id"], "alphafold.pdf", pdf_bytes)
    paper_id = paper["id"]

    headers = {"Authorization": f"Bearer {token}"}
    client.post(f"/api/papers/{paper_id}/extract", headers=headers)

    res = client.get(f"/api/papers/{paper_id}/pages", headers=headers)
    assert res.status_code == 200
    pages = res.json()["pages"]

    assert "AlphaFold 3" in pages[0]["text"]
    assert pages[0]["character_count"] == len(pages[0]["text"])
    assert pages[0]["character_count"] > 0

    assert "Protein-DNA interactions" in pages[1]["text"]
    assert pages[1]["character_count"] == len(pages[1]["text"])
    assert pages[1]["character_count"] > 0


def test_paper_metadata_updated_upon_extraction():
    """Test that paper record reflects completed status, page count, and extracted_at timestamp."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)
    pdf_bytes = generate_multipage_pdf(["A single page of concise research findings."])
    paper = upload_test_paper(token, project["id"], "single_page.pdf", pdf_bytes)
    paper_id = paper["id"]

    # Initial state
    assert paper["extraction_status"] == "not_started"
    assert paper["page_count"] is None or paper["page_count"] == 0
    assert paper["extracted_at"] is None

    headers = {"Authorization": f"Bearer {token}"}
    extract_res = client.post(f"/api/papers/{paper_id}/extract", headers=headers)
    assert extract_res.status_code == 200

    # Retrieve paper via GET
    get_res = client.get(f"/api/papers/{paper_id}", headers=headers)
    assert get_res.status_code == 200
    updated_paper = get_res.json()

    assert updated_paper["extraction_status"] == "completed"
    assert updated_paper["page_count"] == 1
    assert updated_paper["extracted_at"] is not None
    assert updated_paper["extraction_error"] is None


def test_empty_page_handled_gracefully():
    """Test E: Empty/blank page extracts as empty string, character_count=0 without error."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)

    # 3 pages: 1st has text, 2nd is empty, 3rd has text
    pages_content = ["Content on page 1.", "", "Content on page 3."]
    pdf_bytes = generate_multipage_pdf(pages_content)
    paper = upload_test_paper(token, project["id"], "with_empty_page.pdf", pdf_bytes)
    paper_id = paper["id"]

    headers = {"Authorization": f"Bearer {token}"}
    extract_res = client.post(f"/api/papers/{paper_id}/extract", headers=headers)
    assert extract_res.status_code == 200

    res = client.get(f"/api/papers/{paper_id}/pages", headers=headers)
    assert res.status_code == 200
    pages = res.json()["pages"]

    assert len(pages) == 3
    assert pages[1]["page_number"] == 2
    assert pages[1]["text"] == ""
    assert pages[1]["character_count"] == 0


def test_whitespace_only_page_handled_gracefully():
    """Test that a page with only whitespace/newlines extracts safely with stripped text or character count."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)

    pages_content = ["Page 1 content", "   \n\t  \n  ", "Page 3 content"]
    pdf_bytes = generate_multipage_pdf(pages_content)
    paper = upload_test_paper(token, project["id"], "whitespace_page.pdf", pdf_bytes)
    paper_id = paper["id"]

    headers = {"Authorization": f"Bearer {token}"}
    extract_res = client.post(f"/api/papers/{paper_id}/extract", headers=headers)
    assert extract_res.status_code == 200

    res = client.get(f"/api/papers/{paper_id}/pages", headers=headers)
    assert res.status_code == 200
    pages = res.json()["pages"]
    assert len(pages) == 3


def test_idempotent_reextraction():
    """Test F: Calling /extract multiple times safely replaces rows without duplicate key violations."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)
    pdf_bytes = generate_multipage_pdf(["Page one text", "Page two text"])
    paper = upload_test_paper(token, project["id"], "reextract_test.pdf", pdf_bytes)
    paper_id = paper["id"]

    headers = {"Authorization": f"Bearer {token}"}

    # First extraction
    res1 = client.post(f"/api/papers/{paper_id}/extract", headers=headers)
    assert res1.status_code == 200
    assert res1.json()["page_count"] == 2

    # Second extraction (idempotent re-extraction)
    res2 = client.post(f"/api/papers/{paper_id}/extract", headers=headers)
    assert res2.status_code == 200
    assert res2.json()["page_count"] == 2

    # Verify database has exactly 2 rows, not 4
    db = SessionLocal()
    try:
        stmt = select(PaperPage).where(PaperPage.paper_id == uuid.UUID(paper_id))
        rows = db.execute(stmt).scalars().all()
        assert len(rows) == 2
        assert [r.page_number for r in sorted(rows, key=lambda x: x.page_number)] == [1, 2]
    finally:
        db.close()


def test_pages_endpoint_ordered_by_page_number_asc():
    """Test that /pages returns extracted pages in ascending order of page_number."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)
    pages_content = [f"This is the content of research page {i}." for i in range(1, 6)]
    pdf_bytes = generate_multipage_pdf(pages_content)
    paper = upload_test_paper(token, project["id"], "five_pages.pdf", pdf_bytes)
    paper_id = paper["id"]

    headers = {"Authorization": f"Bearer {token}"}
    client.post(f"/api/papers/{paper_id}/extract", headers=headers)

    res = client.get(f"/api/papers/{paper_id}/pages", headers=headers)
    assert res.status_code == 200
    pages = res.json()["pages"]

    assert len(pages) == 5
    page_numbers = [p["page_number"] for p in pages]
    assert page_numbers == [1, 2, 3, 4, 5]


def test_pages_endpoint_empty_before_extraction():
    """Test that /pages returns an empty list with page_count 0 before extraction runs."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)
    pdf_bytes = generate_multipage_pdf(["Some text"])
    paper = upload_test_paper(token, project["id"], "unextracted.pdf", pdf_bytes)
    paper_id = paper["id"]

    headers = {"Authorization": f"Bearer {token}"}
    res = client.get(f"/api/papers/{paper_id}/pages", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["paper_id"] == paper_id
    assert data["page_count"] == 0
    assert data["pages"] == []


def test_unauthenticated_extraction_rejected():
    """Test that unauthenticated POST /extract returns 401."""
    fake_paper_id = uuid.uuid4()
    res = client.post(f"/api/papers/{fake_paper_id}/extract")
    assert res.status_code == 401


def test_unauthenticated_pages_retrieval_rejected():
    """Test that unauthenticated GET /pages returns 401."""
    fake_paper_id = uuid.uuid4()
    res = client.get(f"/api/papers/{fake_paper_id}/pages")
    assert res.status_code == 401


def test_foreign_user_cannot_extract_paper():
    """Test G: User A cannot trigger extraction on User B's paper (returns 404)."""
    _, token_a, _ = create_authenticated_user("Researcher A")
    _, token_b, _ = create_authenticated_user("Researcher B")

    project_a = create_test_project(token_a, "Lab A")
    pdf_bytes = generate_multipage_pdf(["Confidential findings."])
    paper_a = upload_test_paper(token_a, project_a["id"], "confidential.pdf", pdf_bytes)
    paper_a_id = paper_a["id"]

    headers_b = {"Authorization": f"Bearer {token_b}"}
    res = client.post(f"/api/papers/{paper_a_a_id if 'paper_a_a_id' in locals() else paper_a_id}/extract", headers=headers_b)
    assert res.status_code == 404
    assert res.json()["detail"] == "Research paper not found."


def test_foreign_user_cannot_view_extracted_pages():
    """Test G: User A cannot view extracted pages of User B's paper (returns 404)."""
    _, token_a, _ = create_authenticated_user("Researcher A")
    _, token_b, _ = create_authenticated_user("Researcher B")

    project_a = create_test_project(token_a, "Lab A")
    pdf_bytes = generate_multipage_pdf(["Secret research methodology."])
    paper_a = upload_test_paper(token_a, project_a["id"], "secret.pdf", pdf_bytes)
    paper_a_id = paper_a["id"]

    headers_a = {"Authorization": f"Bearer {token_a}"}
    client.post(f"/api/papers/{paper_a_id}/extract", headers=headers_a)

    headers_b = {"Authorization": f"Bearer {token_b}"}
    res = client.get(f"/api/papers/{paper_a_id}/pages", headers=headers_b)
    assert res.status_code == 404
    assert res.json()["detail"] == "Research paper not found."


def test_extract_nonexistent_paper_returns_404():
    """Test that attempting to extract a non-existent paper returns 404."""
    _, token, _ = create_authenticated_user()
    fake_id = uuid.uuid4()
    headers = {"Authorization": f"Bearer {token}"}
    res = client.post(f"/api/papers/{fake_id}/extract", headers=headers)
    assert res.status_code == 404


def test_get_pages_nonexistent_paper_returns_404():
    """Test that requesting pages for a non-existent paper returns 404."""
    _, token, _ = create_authenticated_user()
    fake_id = uuid.uuid4()
    headers = {"Authorization": f"Bearer {token}"}
    res = client.get(f"/api/papers/{fake_id}/pages", headers=headers)
    assert res.status_code == 404


def test_corrupt_pdf_file_handled_gracefully():
    """Test H: Corrupted or unreadable PDF updates status to failed and returns 422."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)

    # Upload valid PDF first
    pdf_bytes = generate_multipage_pdf(["Valid first."])
    paper = upload_test_paper(token, project["id"], "corrupt_candidate.pdf", pdf_bytes)
    paper_id = paper["id"]

    # Now intentionally corrupt the stored file on disk
    db = SessionLocal()
    try:
        p_record = db.execute(select(Paper).where(Paper.id == uuid.UUID(paper_id))).scalar_one()
        stored_path = paper_storage.get_path(p_record.stored_filename)
        assert stored_path is not None
        # Corrupt file contents to non-PDF garbage
        with open(stored_path, "wb") as f:
            f.write(b"NOT_A_VALID_PDF_CORRUPT_BYTES_DATA")
    finally:
        db.close()

    headers = {"Authorization": f"Bearer {token}"}
    res = client.post(f"/api/papers/{paper_id}/extract", headers=headers)
    assert res.status_code == 422
    data = res.json()
    assert "Text extraction failed" in data["detail"]

    # Verify paper record in DB has extraction_status == "failed"
    get_res = client.get(f"/api/papers/{paper_id}", headers=headers)
    assert get_res.status_code == 200
    paper_data = get_res.json()
    assert paper_data["extraction_status"] == "failed"
    assert paper_data["extraction_error"] is not None


def test_missing_stored_file_handled_gracefully():
    """Test that a paper whose file was deleted from disk returns 422 and marks status failed."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)

    pdf_bytes = generate_multipage_pdf(["Some research text."])
    paper = upload_test_paper(token, project["id"], "missing_file.pdf", pdf_bytes)
    paper_id = paper["id"]

    # Delete the file from storage manually
    db = SessionLocal()
    try:
        p_record = db.execute(select(Paper).where(Paper.id == uuid.UUID(paper_id))).scalar_one()
        paper_storage.delete(p_record.stored_filename)
    finally:
        db.close()

    headers = {"Authorization": f"Bearer {token}"}
    res = client.post(f"/api/papers/{paper_id}/extract", headers=headers)
    assert res.status_code == 422

    get_res = client.get(f"/api/papers/{paper_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["extraction_status"] == "failed"


def test_cascade_deletion_removes_paper_pages():
    """Test I: Deleting a paper deletes all associated PaperPage records."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)

    pdf_bytes = generate_multipage_pdf(["Page 1", "Page 2", "Page 3"])
    paper = upload_test_paper(token, project["id"], "to_delete.pdf", pdf_bytes)
    paper_id = paper["id"]

    headers = {"Authorization": f"Bearer {token}"}
    client.post(f"/api/papers/{paper_id}/extract", headers=headers)

    # Verify pages exist in DB
    db = SessionLocal()
    try:
        stmt = select(PaperPage).where(PaperPage.paper_id == uuid.UUID(paper_id))
        pages_before = db.execute(stmt).scalars().all()
        assert len(pages_before) == 3
    finally:
        db.close()

    # Delete the paper
    del_res = client.delete(f"/api/papers/{paper_id}", headers=headers)
    assert del_res.status_code == 204

    # Verify pages are deleted from DB
    db = SessionLocal()
    try:
        stmt = select(PaperPage).where(PaperPage.paper_id == uuid.UUID(paper_id))
        pages_after = db.execute(stmt).scalars().all()
        assert len(pages_after) == 0
    finally:
        db.close()


def test_extraction_status_badge_in_paper_list():
    """Test that listing papers includes extraction_status and page_count."""
    _, token, _ = create_authenticated_user()
    project = create_test_project(token)

    pdf_bytes = generate_multipage_pdf(["Page 1 content", "Page 2 content"])
    paper = upload_test_paper(token, project["id"], "study.pdf", pdf_bytes)
    paper_id = paper["id"]

    headers = {"Authorization": f"Bearer {token}"}
    # Before extraction
    list_res = client.get("/api/papers", headers=headers)
    assert list_res.status_code == 200
    papers = list_res.json()["papers"]
    target = next(p for p in papers if p["id"] == paper_id)
    assert target["extraction_status"] == "not_started"
    assert target["page_count"] is None or target["page_count"] == 0

    # Extract
    client.post(f"/api/papers/{paper_id}/extract", headers=headers)

    # After extraction
    list_res2 = client.get("/api/papers", headers=headers)
    assert list_res2.status_code == 200
    papers2 = list_res2.json()["papers"]
    target2 = next(p for p in papers2 if p["id"] == paper_id)
    assert target2["extraction_status"] == "completed"
    assert target2["page_count"] == 2
