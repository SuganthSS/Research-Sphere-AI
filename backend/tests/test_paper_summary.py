"""Comprehensive test suite for Module 7 / Iteration 7.1:
Structured Scientific Paper Summarization.

Tests cover:
- Precondition enforcement (paper exists, user owns paper, chunking completed, embedding completed)
- Evidence retrieval across 6 scientific dimensions
- Grounded structured summarization generation with mocked LLM (zero Groq credit burn)
- Strict validation of all 6 scientific dimensions:
  1. objective
  2. methodology
  3. dataset_setup
  4. key_findings
  5. limitations
  6. future_work
- Missing evidence fallback: "Not clearly stated in the paper." with citations: []
- Authoritative citation mapping to real PaperChunk records
- Summary persistence and non-duplicate regeneration in PostgreSQL (1:1 PaperSummary)
- GET /api/papers/{paper_id}/summary retrieval and 404 handling
- Multi-tenant security & ownership isolation
- LLM failure and exception normalization
"""
import io
import json
import uuid
from typing import Any, Dict, Optional
from unittest.mock import MagicMock, patch
import pytest
import pymupdf
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import get_db
from app.models.paper import Paper
from app.models.paper_chunk import PaperChunk
from app.models.paper_summary import PaperSummary
from app.schemas.summary import (
    PaperSummaryResponse,
    StructuredSummary,
    SummaryCitation,
    SummarySection,
)
from app.services.llm.base import BaseLLMProvider
from app.services.llm.service import llm_service
from app.services.paper_summary_service import (
    NOT_STATED_MESSAGE,
    PaperPreconditionError,
    PaperSummaryError,
    paper_summary_service,
)

client = TestClient(app)


# ---------------------------------------------------------------------------
# Test Helpers & Mock Provider
# ---------------------------------------------------------------------------

class MockSummaryLLMProvider(BaseLLMProvider):
    """Deterministic mock LLM provider for paper summarization tests."""

    def __init__(
        self,
        canned_response: Optional[str] = None,
        should_fail: Optional[Exception] = None,
    ) -> None:
        self.canned_response = canned_response or json.dumps({
            "objective": {
                "summary": "The objective is to evaluate transformer architectures for scientific text.",
                "citations": [1]
            },
            "methodology": {
                "summary": "The study applies self-attention mechanisms and multi-task learning [2].",
                "citations": [2]
            },
            "dataset_setup": {
                "summary": "Experiments were performed on PubMed Central and arXiv subsets.",
                "citations": [3]
            },
            "key_findings": {
                "summary": "Achieved a 4.2% improvement in F1-score over baseline models.",
                "citations": [3]
            },
            "limitations": {
                "summary": "Not clearly stated in the paper.",
                "citations": []
            },
            "future_work": {
                "summary": "Future work will explore parameter-efficient fine-tuning on specialized medical domains.",
                "citations": [1]
            }
        })
        self.should_fail = should_fail
        self.last_prompt: Optional[str] = None
        self.last_system_instruction: Optional[str] = None

    def generate(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.1,
    ) -> str:
        self.last_prompt = prompt
        self.last_system_instruction = system_instruction
        if self.should_fail:
            raise self.should_fail
        return self.canned_response

    def get_status(self) -> Dict[str, Any]:
        return {
            "provider": "mock-groq",
            "model": "llama-3.3-70b-versatile",
            "configured": True,
            "status": "configured",
            "message": "Mock Groq active.",
        }


def create_authenticated_user(name: str = "Dr. Summary Tester") -> tuple[dict, str, uuid.UUID]:
    email = f"summary_{uuid.uuid4().hex[:8]}@example.com"
    password = "StrongPassword2026!"
    reg_res = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": password},
    )
    assert reg_res.status_code == 201, reg_res.text
    user_data = reg_res.json()
    user_id = uuid.UUID(user_data["id"])
    login_res = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert login_res.status_code == 200, login_res.text
    token = login_res.json()["access_token"]
    return user_data, token, user_id


def create_test_project(token: str, name: str = "Paper Summary Lab") -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    res = client.post(
        "/api/projects",
        headers=headers,
        json={"name": name, "description": "Testing Paper Summarization."},
    )
    assert res.status_code == 201, res.text
    return res.json()


def generate_research_pdf() -> bytes:
    pages = [
        "Abstract\n\nThis research investigates transformer architectures for biomedical text understanding.",
        "Methodology\n\nWe train a 12-layer bidirectional encoder with masked language modeling and cross-entropy loss.",
        "Experimental Setup and Results\n\nEvaluated on PubMed benchmarks. The model achieves 94.6% accuracy.",
    ]
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page(width=595, height=842)
        page.insert_text((50, 72), text, fontsize=11)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def upload_and_prepare_paper(
    token: str,
    project_id: str,
    extract: bool = True,
    process: bool = True,
    embed: bool = True,
) -> dict:
    """Helper to upload a paper and run pipeline up to requested stage."""
    headers = {"Authorization": f"Bearer {token}"}
    pdf_bytes = generate_research_pdf()
    files = {"file": ("summary_paper.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    upload_res = client.post(f"/api/projects/{project_id}/papers", headers=headers, files=files)
    assert upload_res.status_code == 201, upload_res.text
    paper = upload_res.json()
    paper_id = paper["id"]

    if extract:
        ext_res = client.post(f"/api/papers/{paper_id}/extract", headers=headers)
        assert ext_res.status_code == 200, ext_res.text

    if process:
        proc_res = client.post(f"/api/papers/{paper_id}/process", headers=headers)
        assert proc_res.status_code == 200, proc_res.text

    if embed:
        emb_res = client.post(f"/api/papers/{paper_id}/embed", headers=headers)
        assert emb_res.status_code == 200, emb_res.text

    return paper


# ---------------------------------------------------------------------------
# 1. PaperSummaryService Unit Tests
# ---------------------------------------------------------------------------

class TestPaperSummaryServiceUnit:
    """Unit tests for PaperSummaryService response parsing, schema enforcement, and missing evidence handling."""

    def test_parse_and_validate_clean_json(self):
        source_map = {
            1: {
                "chunk_id": uuid.uuid4(),
                "chunk_index": 0,
                "section_name": "Abstract",
                "start_page": 1,
                "end_page": 1,
            },
            2: {
                "chunk_id": uuid.uuid4(),
                "chunk_index": 1,
                "section_name": "Methodology",
                "start_page": 2,
                "end_page": 2,
            },
        }
        paper_id = uuid.uuid4()
        raw_llm = json.dumps({
            "objective": {"summary": "Study transformer architectures.", "citations": [1]},
            "methodology": {"summary": "Bidirectional transformer encoder.", "citations": [2]},
            "dataset_setup": {"summary": "PubMed corpus.", "citations": [1]},
            "key_findings": {"summary": "High accuracy achieved.", "citations": [2]},
            "limitations": {"summary": "Not clearly stated in the paper.", "citations": []},
            "future_work": {"summary": "Expand domain corpus.", "citations": [2]},
        })

        summary = paper_summary_service._parse_and_validate_response(raw_llm, source_map, paper_id)
        assert summary.objective.summary == "Study transformer architectures."
        assert len(summary.objective.citations) == 1
        assert summary.objective.citations[0].source_number == 1
        assert summary.objective.citations[0].paper_id == paper_id
        assert summary.limitations.summary == NOT_STATED_MESSAGE
        assert summary.limitations.citations == []

    def test_parse_markdown_wrapped_json(self):
        source_map = {
            1: {
                "chunk_id": uuid.uuid4(),
                "chunk_index": 0,
                "section_name": "Abstract",
                "start_page": 1,
                "end_page": 1,
            }
        }
        paper_id = uuid.uuid4()
        raw_llm = f"```json\n{json.dumps({'objective': {'summary': 'A fine study.', 'citations': [1]}})}\n```"

        summary = paper_summary_service._parse_and_validate_response(raw_llm, source_map, paper_id)
        assert summary.objective.summary == "A fine study."
        assert len(summary.objective.citations) == 1
        # Missing fields should default to NOT_STATED_MESSAGE with empty citations
        assert summary.methodology.summary == NOT_STATED_MESSAGE
        assert summary.methodology.citations == []
        assert summary.dataset_setup.summary == NOT_STATED_MESSAGE
        assert summary.key_findings.summary == NOT_STATED_MESSAGE
        assert summary.limitations.summary == NOT_STATED_MESSAGE
        assert summary.future_work.summary == NOT_STATED_MESSAGE

    def test_missing_evidence_strips_hallucinated_citations(self):
        source_map = {
            1: {
                "chunk_id": uuid.uuid4(),
                "chunk_index": 0,
                "section_name": "Abstract",
                "start_page": 1,
                "end_page": 1,
            }
        }
        paper_id = uuid.uuid4()
        # Even if LLM returns "Not clearly stated in the paper." with citations [1], citations must be forced empty
        raw_llm = json.dumps({
            "limitations": {"summary": "Not clearly stated in the paper.", "citations": [1]},
        })

        summary = paper_summary_service._parse_and_validate_response(raw_llm, source_map, paper_id)
        assert summary.limitations.summary == NOT_STATED_MESSAGE
        assert summary.limitations.citations == []

    def test_invalid_source_numbers_ignored(self):
        source_map = {
            1: {
                "chunk_id": uuid.uuid4(),
                "chunk_index": 0,
                "section_name": "Abstract",
                "start_page": 1,
                "end_page": 1,
            }
        }
        paper_id = uuid.uuid4()
        # Source 99 does not exist in source_map
        raw_llm = json.dumps({
            "objective": {"summary": "Target objective.", "citations": [1, 99]},
        })

        summary = paper_summary_service._parse_and_validate_response(raw_llm, source_map, paper_id)
        assert len(summary.objective.citations) == 1
        assert summary.objective.citations[0].source_number == 1


# ---------------------------------------------------------------------------
# 2. Paper Summary API Endpoints Tests
# ---------------------------------------------------------------------------

class TestPaperSummaryAPI:
    """Integration tests for POST and GET /api/papers/{paper_id}/summary."""

    def test_summary_requires_authentication(self):
        fake_id = uuid.uuid4()
        post_res = client.post(f"/api/papers/{fake_id}/summary")
        assert post_res.status_code == 401

        get_res = client.get(f"/api/papers/{fake_id}/summary")
        assert get_res.status_code == 401

    def test_summary_not_found_for_missing_paper(self):
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        fake_id = uuid.uuid4()

        post_res = client.post(f"/api/papers/{fake_id}/summary", headers=headers)
        assert post_res.status_code == 404
        assert "not found" in post_res.json()["detail"].lower()

        get_res = client.get(f"/api/papers/{fake_id}/summary", headers=headers)
        assert get_res.status_code == 404

    def test_summary_precondition_unprocessed_paper(self):
        """Paper without chunking or embedding completed must return 422."""
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        project = create_test_project(token)

        # Upload but do not extract, process, or embed
        paper = upload_and_prepare_paper(token, project["id"], extract=False, process=False, embed=False)
        paper_id = paper["id"]

        res = client.post(f"/api/papers/{paper_id}/summary", headers=headers)
        assert res.status_code == 422
        assert "chunking must be completed" in res.json()["detail"].lower()

    def test_summary_precondition_unembedded_paper(self):
        """Paper with chunking completed but embedding not completed must return 422."""
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        project = create_test_project(token)

        # Upload, extract, and process, but do not embed
        paper = upload_and_prepare_paper(token, project["id"], extract=True, process=True, embed=False)
        paper_id = paper["id"]

        res = client.post(f"/api/papers/{paper_id}/summary", headers=headers)
        assert res.status_code == 422
        assert "semantic indexing must be completed" in res.json()["detail"].lower()

    def test_generate_and_get_summary_success(self):
        """Test full generation, schema adherence, DB persistence, and subsequent GET retrieval."""
        _, token, user_id = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        project = create_test_project(token)
        paper = upload_and_prepare_paper(token, project["id"])
        paper_id = paper["id"]

        # Before generation, GET should return 404 (no summary yet)
        get_before = client.get(f"/api/papers/{paper_id}/summary", headers=headers)
        assert get_before.status_code == 404
        assert "no summary has been generated" in get_before.json()["detail"].lower()

        # Mock LLM provider
        mock_provider = MockSummaryLLMProvider()
        with patch.object(llm_service, "_provider", mock_provider):
            post_res = client.post(f"/api/papers/{paper_id}/summary", headers=headers)

        assert post_res.status_code == 200, post_res.text
        data = post_res.json()

        assert data["paper_id"] == paper_id
        assert "summary" in data
        summary = data["summary"]

        # Verify all 6 dimensions
        expected_dims = ["objective", "methodology", "dataset_setup", "key_findings", "limitations", "future_work"]
        for dim in expected_dims:
            assert dim in summary, f"Dimension {dim} missing from summary response"
            assert "summary" in summary[dim]
            assert "citations" in summary[dim]
            assert isinstance(summary[dim]["citations"], list)

        # Check citations in objective
        obj_cites = summary["objective"]["citations"]
        assert len(obj_cites) > 0
        assert obj_cites[0]["paper_id"] == paper_id
        assert "chunk_id" in obj_cites[0]
        assert "section_name" in obj_cites[0]
        assert "start_page" in obj_cites[0]
        assert "end_page" in obj_cites[0]

        # Check missing evidence limitation
        assert summary["limitations"]["summary"] == NOT_STATED_MESSAGE
        assert summary["limitations"]["citations"] == []

        # Now GET /api/papers/{paper_id}/summary must return 200 with the exact persisted data
        get_res = client.get(f"/api/papers/{paper_id}/summary", headers=headers)
        assert get_res.status_code == 200
        get_data = get_res.json()
        assert get_data["id"] == data["id"]
        assert get_data["paper_id"] == paper_id
        assert get_data["summary"]["objective"]["summary"] == summary["objective"]["summary"]

    def test_regenerate_summary_updates_without_duplicates(self):
        """Regenerating a summary updates the existing PaperSummary row and preserves 1:1 relationship."""
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        project = create_test_project(token)
        paper = upload_and_prepare_paper(token, project["id"])
        paper_id = paper["id"]

        mock_provider1 = MockSummaryLLMProvider()
        with patch.object(llm_service, "_provider", mock_provider1):
            res1 = client.post(f"/api/papers/{paper_id}/summary", headers=headers)
        assert res1.status_code == 200
        first_id = res1.json()["id"]

        # Regenerate with new response content
        updated_llm_json = json.dumps({
            "objective": {"summary": "Regenerated objective text.", "citations": [1]},
            "methodology": {"summary": "Regenerated methodology text.", "citations": [2]},
            "dataset_setup": {"summary": "Regenerated dataset text.", "citations": [1]},
            "key_findings": {"summary": "Regenerated findings text.", "citations": [2]},
            "limitations": {"summary": "Not clearly stated in the paper.", "citations": []},
            "future_work": {"summary": "Regenerated future work.", "citations": [1]},
        })
        mock_provider2 = MockSummaryLLMProvider(canned_response=updated_llm_json)
        with patch.object(llm_service, "_provider", mock_provider2):
            res2 = client.post(f"/api/papers/{paper_id}/summary", headers=headers)

        assert res2.status_code == 200
        updated_data = res2.json()

        # Same record ID, updated content
        assert updated_data["id"] == first_id
        assert updated_data["summary"]["objective"]["summary"] == "Regenerated objective text."

    def test_multi_tenant_isolation(self):
        """User B cannot generate or access User A's paper summary."""
        _, token_a, _ = create_authenticated_user(name="User A")
        _, token_b, _ = create_authenticated_user(name="User B")

        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        project_a = create_test_project(token_a, "User A Lab")
        paper_a = upload_and_prepare_paper(token_a, project_a["id"])
        paper_a_id = paper_a["id"]

        # Generate summary as User A
        mock_provider = MockSummaryLLMProvider()
        with patch.object(llm_service, "_provider", mock_provider):
            res_a = client.post(f"/api/papers/{paper_a_id}/summary", headers=headers_a)
        assert res_a.status_code == 200

        # User B attempts to GET summary of Paper A -> 404
        get_b = client.get(f"/api/papers/{paper_a_id}/summary", headers=headers_b)
        assert get_b.status_code == 404

        # User B attempts to POST regenerate summary of Paper A -> 404
        post_b = client.post(f"/api/papers/{paper_a_id}/summary", headers=headers_b)
        assert post_b.status_code == 404

    def test_llm_failure_returns_500_cleanly(self):
        """When LLM provider raises an exception, the API handles it and returns 500 cleanly."""
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        project = create_test_project(token)
        paper = upload_and_prepare_paper(token, project["id"])
        paper_id = paper["id"]

        failing_provider = MockSummaryLLMProvider(should_fail=RuntimeError("Groq service connection dropped"))
        with patch.object(llm_service, "_provider", failing_provider):
            res = client.post(f"/api/papers/{paper_id}/summary", headers=headers)

        assert res.status_code == 500
        assert "AI summarization service failed" in res.json()["detail"]
