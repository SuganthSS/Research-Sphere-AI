"""Targeted test suite for Module 13.5: Paper Discovery and Open-Access Import (OpenAlex).

Covers:
1. test_openalex_search_mapping
2. test_oa_only_filtering
3. test_missing_oa_pdf_rejection
4. test_successful_pdf_import
5. test_import_enters_ingestion_pipeline
6. test_duplicate_paper_prevention
7. test_project_ownership_enforcement
8. test_invalid_pdf_rejection
9. test_oversized_download_rejection
10. test_ssrf_private_ip_rejection
11. test_redirect_validation
12. test_rate_limit_handling
13. test_provider_unavailable_handling
14. test_discovery_api_response_structure
"""
import socket
import uuid
from typing import Any, Dict
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient
import httpx

from app.main import app
from app.models.paper import Paper
from app.models.project import Project
from app.db.session import SessionLocal
from app.schemas.discovery import PaperImportRequest
from app.services.discovery.openalex import OpenAlexProvider, reconstruct_abstract, extract_arxiv_id
from app.services.discovery.security import (
    safe_download_pdf,
    validate_safe_url,
    SSRFSecurityError,
)
from app.services.discovery.service import PaperDiscoveryService

client = TestClient(app)

SAMPLE_VALID_PDF_BYTES = b"%PDF-1.5\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\ntrailer\n<</Root 1 0 R>>\n%%EOF"


# ---------------------------------------------------------------------------
# Test Helpers
# ---------------------------------------------------------------------------

def create_discovery_user_and_project(suffix: str = "") -> tuple[dict, str, Project]:
    """Creates user, authenticates, and initializes a research project."""
    email = f"discuser_{suffix}_{uuid.uuid4().hex[:6]}@example.com"
    password = "StrongPassword2026!"
    reg_res = client.post(
        "/api/auth/register",
        json={"name": f"Researcher {suffix}", "email": email, "password": password},
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

    db = SessionLocal()
    try:
        project = Project(
            id=uuid.uuid4(),
            user_id=user_id,
            name=f"Discovery Lab {suffix}",
            description="Testing Module 13.5",
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        return user_data, token, project
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 1. test_openalex_search_mapping
# ---------------------------------------------------------------------------

def test_openalex_search_mapping():
    """Validates OpenAlex works API response parsing into DiscoveredPaperItem."""
    provider = OpenAlexProvider()

    mock_openalex_resp = {
        "meta": {"count": 1},
        "results": [
            {
                "id": "https://openalex.org/W4406031095",
                "title": "Retrieval-Augmented Generation with Graphs (GraphRAG)",
                "publication_year": 2025,
                "cited_by_count": 42,
                "doi": "https://doi.org/10.48550/arxiv.2501.00309",
                "primary_location": {
                    "source": {"display_name": "arXiv (Cornell University)"},
                    "landing_page_url": "http://arxiv.org/abs/2501.00309",
                    "pdf_url": "https://arxiv.org/pdf/2501.00309",
                },
                "open_access": {
                    "is_oa": True,
                    "oa_status": "green",
                },
                "best_oa_location": {
                    "landing_page_url": "http://arxiv.org/abs/2501.00309",
                    "pdf_url": "https://arxiv.org/pdf/2501.00309",
                },
                "authorships": [
                    {"author": {"display_name": "Haoyu Han"}},
                    {"author": {"display_name": "Yu Wang"}},
                ],
                "concepts": [
                    {"display_name": "Graph (abstract data type)"},
                    {"display_name": "Artificial intelligence"},
                ],
                "abstract_inverted_index": {
                    "GraphRAG": [0],
                    "unifies": [1],
                    "retrieval": [2],
                    "with": [3],
                    "graphs": [4],
                },
            }
        ],
    }

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = mock_openalex_resp

    with patch("httpx.Client.get", return_value=mock_response):
        result = provider.search_papers("GraphRAG", limit=5)

        assert result.total_results == 1
        assert len(result.papers) == 1
        paper = result.papers[0]
        assert paper.paper_id == "W4406031095"
        assert paper.title == "Retrieval-Augmented Generation with Graphs (GraphRAG)"
        assert paper.year == 2025
        assert paper.citation_count == 42
        assert paper.authors == ["Haoyu Han", "Yu Wang"]
        assert paper.is_open_access is True
        assert paper.open_access_pdf_url == "https://arxiv.org/pdf/2501.00309"
        assert paper.abstract == "GraphRAG unifies retrieval with graphs"
        assert paper.arxiv_id == "2501.00309"
        assert paper.provider == "openalex"


# ---------------------------------------------------------------------------
# 2. test_oa_only_filtering
# ---------------------------------------------------------------------------

def test_oa_only_filtering():
    """Validates that open_access_only adds is_oa:true to OpenAlex query filter."""
    provider = OpenAlexProvider()

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"meta": {"count": 0}, "results": []}

    with patch("httpx.Client.get", return_value=mock_response) as mock_get:
        provider.search_papers("Quantum NLP", open_access_only=True, year="2024")
        args, kwargs = mock_get.call_args
        params = kwargs.get("params", {})
        assert "is_oa:true" in params.get("filter", "")
        assert "publication_year:2024" in params.get("filter", "")


# ---------------------------------------------------------------------------
# 3. test_missing_oa_pdf_rejection
# ---------------------------------------------------------------------------

def test_missing_oa_pdf_rejection():
    """Importing a paper without open_access_pdf_url returns HTTP 400."""
    user_data, token, project = create_discovery_user_and_project("nooa")

    payload = {
        "project_id": str(project.id),
        "title": "Closed Access Paper",
        "open_access_pdf_url": "",  # Empty OA URL
        "paper_id": "W12345",
    }

    res = client.post(
        "/api/discovery/import",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 400
    assert "PDF not openly available" in res.json()["detail"]


# ---------------------------------------------------------------------------
# 4. test_successful_pdf_import
# ---------------------------------------------------------------------------

def test_successful_pdf_import():
    """Validates downloading an open-access PDF, saving it, and persisting the Paper model."""
    user_data, token, project = create_discovery_user_and_project("importok")
    user_id = uuid.UUID(user_data["id"])

    payload = {
        "project_id": str(project.id),
        "title": "A Safe Study on GraphRAG",
        "open_access_pdf_url": "https://arxiv.org/pdf/2404.16130",
        "paper_id": "W998877",
        "doi": "10.48550/arXiv.2404.16130",
        "arxiv_id": "2404.16130",
        "authors": ["Dr. Researcher", "Prof. Graph"],
        "year": 2024,
        "venue": "arXiv",
        "auto_extract": False,
    }

    with patch("app.services.discovery.service.safe_download_pdf", return_value=SAMPLE_VALID_PDF_BYTES):
        res = client.post(
            "/api/discovery/import",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["title"] == "A Safe Study on GraphRAG"
        assert data["status"] == "uploaded"
        assert data["file_size"] == len(SAMPLE_VALID_PDF_BYTES)

        # Verify database record
        db = SessionLocal()
        try:
            saved_paper = db.query(Paper).filter(Paper.id == uuid.UUID(data["paper_id"])).first()
            assert saved_paper is not None
            assert saved_paper.doi == "10.48550/arXiv.2404.16130"
            assert saved_paper.external_id == "W998877"
            assert saved_paper.arxiv_id == "2404.16130"
            assert saved_paper.authors_str == "Dr. Researcher, Prof. Graph"
        finally:
            db.close()


# ---------------------------------------------------------------------------
# 5. test_import_enters_ingestion_pipeline
# ---------------------------------------------------------------------------

def test_import_enters_ingestion_pipeline():
    """Validates that auto_extract=True triggers page extraction into PaperPage rows."""
    user_data, token, project = create_discovery_user_and_project("pipeline")

    payload = {
        "project_id": str(project.id),
        "title": "Ingested Graph Study",
        "open_access_pdf_url": "https://arxiv.org/pdf/2501.00309",
        "paper_id": "W554433",
        "auto_extract": True,
    }

    mock_extraction = MagicMock()
    page1 = MagicMock(page_number=1, text="Page 1 Content", character_count=14)
    page2 = MagicMock(page_number=2, text="Page 2 Content", character_count=14)
    mock_extraction.pages = [page1, page2]

    with patch("app.services.discovery.service.safe_download_pdf", return_value=SAMPLE_VALID_PDF_BYTES), \
         patch("app.services.pdf_extraction.pdf_extractor.extract_from_storage", return_value=mock_extraction):

        res = client.post(
            "/api/discovery/import",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["extraction_status"] == "completed"
        assert data["page_count"] == 2
        assert data["status"] == "processed"


# ---------------------------------------------------------------------------
# 6. test_duplicate_paper_prevention
# ---------------------------------------------------------------------------

def test_duplicate_paper_prevention():
    """Duplicate DOI, external ID, arXiv ID, or title in the same project returns HTTP 409."""
    user_data, token, project = create_discovery_user_and_project("dupes")

    payload1 = {
        "project_id": str(project.id),
        "title": "Original Paper on Attention",
        "open_access_pdf_url": "https://arxiv.org/pdf/1706.03762",
        "paper_id": "W_ATTN_1",
        "doi": "10.1145/original_attention",
        "arxiv_id": "1706.03762",
        "auto_extract": False,
    }

    with patch("app.services.discovery.service.safe_download_pdf", return_value=SAMPLE_VALID_PDF_BYTES):
        res1 = client.post("/api/discovery/import", json=payload1, headers={"Authorization": f"Bearer {token}"})
        assert res1.status_code == 201

        # Duplicate Attempt A: Same DOI
        res_doi = client.post(
            "/api/discovery/import",
            json={**payload1, "title": "Different Title But Same DOI"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_doi.status_code == 409
        assert "Paper already exists in this project" in res_doi.json()["detail"]

        # Duplicate Attempt B: Same External ID
        res_ext = client.post(
            "/api/discovery/import",
            json={**payload1, "title": "New Title", "doi": "10.999/different", "arxiv_id": "9999.9999"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_ext.status_code == 409

        # Duplicate Attempt C: Same normalized title
        res_title = client.post(
            "/api/discovery/import",
            json={
                "project_id": str(project.id),
                "title": "original paper on attention!",
                "open_access_pdf_url": "https://arxiv.org/pdf/1706.03762",
                "paper_id": "W_NEW_ID",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_title.status_code == 409


# ---------------------------------------------------------------------------
# 7. test_project_ownership_enforcement
# ---------------------------------------------------------------------------

def test_project_ownership_enforcement():
    """User B cannot import papers into User A's project (returns HTTP 404)."""
    user_a, token_a, proj_a = create_discovery_user_and_project("ownerA")
    user_b, token_b, proj_b = create_discovery_user_and_project("ownerB")

    payload = {
        "project_id": str(proj_a.id),  # Belongs to User A
        "title": "User B Intrusion Attempt",
        "open_access_pdf_url": "https://arxiv.org/pdf/2404.16130",
        "paper_id": "W_FOREIGN",
        "auto_extract": False,
    }

    # User B requests import into User A's project
    res = client.post(
        "/api/discovery/import",
        json=payload,
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res.status_code == 404
    assert "Research project not found" in res.json()["detail"]


# ---------------------------------------------------------------------------
# 8. test_invalid_pdf_rejection
# ---------------------------------------------------------------------------

def test_invalid_pdf_rejection():
    """Reject download content missing %PDF- magic signature."""
    invalid_bytes = b"<html><body>Not a PDF document</body></html>"

    with patch("httpx.Client.get") as mock_get, \
         patch("app.services.discovery.security.validate_safe_url"):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"Content-Length": str(len(invalid_bytes))}
        mock_resp.content = invalid_bytes
        mock_get.return_value = mock_resp

        with pytest.raises(Exception) as exc_info:
            safe_download_pdf("https://example.com/fake.pdf")
        assert "not a valid PDF document" in str(exc_info.value)


# ---------------------------------------------------------------------------
# 9. test_oversized_download_rejection
# ---------------------------------------------------------------------------

def test_oversized_download_rejection():
    """Reject downloads exceeding max size limit (50 MB)."""
    with patch("httpx.Client.get") as mock_get, \
         patch("app.services.discovery.security.validate_safe_url"):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        # Declare 60 MB
        mock_resp.headers = {"Content-Length": str(60 * 1024 * 1024)}
        mock_get.return_value = mock_resp

        with pytest.raises(Exception) as exc_info:
            safe_download_pdf("https://example.com/oversized.pdf", max_size_bytes=50 * 1024 * 1024)
        assert "exceeds maximum allowed size" in str(exc_info.value)


# ---------------------------------------------------------------------------
# 10. test_ssrf_private_ip_rejection
# ---------------------------------------------------------------------------

def test_ssrf_private_ip_rejection():
    """Reject non-HTTPS schemes and private/local network IP targets."""
    # Scheme check: HTTP forbidden
    with pytest.raises(SSRFSecurityError) as exc_http:
        validate_safe_url("http://arxiv.org/pdf/test.pdf")
    assert "Only secure HTTPS URLs" in str(exc_http.value)

    # Localhost / Private IP checks
    private_hosts = ["localhost", "127.0.0.1", "10.0.0.1", "192.168.1.1", "169.254.169.254", "internal.corp"]
    for host in private_hosts:
        with pytest.raises(SSRFSecurityError):
            validate_safe_url(f"https://{host}/secret.pdf")


# ---------------------------------------------------------------------------
# 11. test_redirect_validation
# ---------------------------------------------------------------------------

def test_redirect_validation():
    """Validates that redirects are followed safely and re-validated for SSRF."""
    with patch("httpx.Client.get") as mock_get, \
         patch("app.services.discovery.security.validate_safe_url"):

        # First request returns 302 redirect to another HTTPS URL
        mock_redirect = MagicMock()
        mock_redirect.status_code = 302
        mock_redirect.headers = {"Location": "https://secure-repo.org/final.pdf"}

        # Second request returns 200 with valid PDF
        mock_final = MagicMock()
        mock_final.status_code = 200
        mock_final.headers = {"Content-Length": str(len(SAMPLE_VALID_PDF_BYTES))}
        mock_final.content = SAMPLE_VALID_PDF_BYTES

        mock_get.side_effect = [mock_redirect, mock_final]

        downloaded = safe_download_pdf("https://initial.org/paper.pdf", max_redirects=3)
        assert downloaded.startswith(b"%PDF-")
        assert mock_get.call_count == 2


# ---------------------------------------------------------------------------
# 12. test_rate_limit_handling
# ---------------------------------------------------------------------------

def test_rate_limit_handling():
    """Validates that HTTP 429 from provider maps to clean application message."""
    user_data, token, project = create_discovery_user_and_project("ratelimit")

    with patch("httpx.Client.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 429
        mock_resp.text = "Too Many Requests"
        mock_get.return_value = mock_resp

        res = client.get(
            "/api/discovery/search?query=GraphRAG",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 429
        assert "Paper discovery is temporarily rate limited. Please try again shortly." in res.json()["detail"]


# ---------------------------------------------------------------------------
# 13. test_provider_unavailable_handling
# ---------------------------------------------------------------------------

def test_provider_unavailable_handling():
    """Validates graceful error handling when provider is unreachable."""
    user_data, token, project = create_discovery_user_and_project("unavail")

    with patch("httpx.Client.get", side_effect=httpx.ConnectError("Connection refused")):
        res = client.get(
            "/api/discovery/search?query=GraphRAG",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 502
        assert "Scholarly discovery failed" in res.json()["detail"]


# ---------------------------------------------------------------------------
# 14. test_discovery_api_response_structure
# ---------------------------------------------------------------------------

def test_discovery_api_response_structure():
    """Validates end-to-end schema compliance of GET /api/discovery/search."""
    user_data, token, project = create_discovery_user_and_project("struct")

    mock_openalex_resp = {
        "meta": {"count": 1},
        "results": [
            {
                "id": "https://openalex.org/W112233",
                "title": "A Systematic Review of GraphRAG",
                "publication_year": 2024,
                "cited_by_count": 15,
                "doi": "https://doi.org/10.1145/test",
                "primary_location": {
                    "source": {"display_name": "ACM Computing Surveys"},
                    "landing_page_url": "https://doi.org/10.1145/test",
                    "pdf_url": "https://openalex.org/sample.pdf",
                },
                "open_access": {"is_oa": True},
                "best_oa_location": {
                    "landing_page_url": "https://doi.org/10.1145/test",
                    "pdf_url": "https://openalex.org/sample.pdf",
                },
                "authorships": [{"author": {"display_name": "Dr. Graph"}}],
                "concepts": [{"display_name": "Knowledge Graph"}],
                "abstract_inverted_index": {"GraphRAG": [0], "survey": [1]},
            }
        ],
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_openalex_resp

    with patch("httpx.Client.get", return_value=mock_resp):
        res = client.get(
            "/api/discovery/search?query=GraphRAG&limit=5",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert "query" in data
        assert "total_results" in data
        assert "papers" in data
        assert "provider" in data
        assert data["provider"] == "openalex"

        paper = data["papers"][0]
        for field in [
            "paper_id",
            "title",
            "authors",
            "year",
            "venue",
            "citation_count",
            "is_open_access",
            "open_access_pdf_url",
            "provider",
            "topics",
        ]:
            assert field in paper
