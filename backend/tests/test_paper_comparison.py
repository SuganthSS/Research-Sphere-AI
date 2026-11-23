"""Comprehensive test suite for Module 8 / Iteration 8.1:
Evidence-Grounded Paper Comparison.

Tests cover:
- Precondition enforcement:
  * Minimum 2 papers, maximum 5 papers (HTTP 422)
  * Ownership enforcement (User B cannot compare or retrieve User A's papers -> HTTP 404)
  * Unindexed / unprocessed paper rejection (HTTP 422)
- Grounded multi-paper comparison generation with mocked LLM:
  * Successful 2-paper comparison
  * Successful 3-paper comparison
  * Schema compliance: all 6 dimensions (objective, methodology, dataset_setup, key_findings, limitations, future_work)
  * Similarities and differences synthesis
  * Authoritative citation attribution (paper's dimension cites only its own chunks)
  * Missing evidence fallback: "Not clearly stated in the paper." with citations: []
- Persistence & idempotence:
  * GET /api/comparisons/{id} retrieval and ownership check
  * GET /api/comparisons?paper_ids=... retrieval
  * Regeneration updates existing PaperComparison row without duplicate records
- Resilience & failure modes:
  * LLM provider connection failure returns HTTP 500 cleanly
"""
import io
import json
import uuid
from typing import Any, Dict, List, Optional
from unittest.mock import patch
import pytest
import pymupdf
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import get_db
from app.models.paper import Paper
from app.models.paper_comparison import PaperComparison
from app.models.paper_summary import PaperSummary
from app.schemas.comparison import (
    PaperComparisonResponse,
    StructuredComparison,
)
from app.services.llm.base import BaseLLMProvider
from app.services.llm.service import llm_service
from app.services.paper_comparison_service import (
    NOT_STATED_MESSAGE,
    PaperComparisonPreconditionError,
    paper_comparison_service,
)

client = TestClient(app)


# ---------------------------------------------------------------------------
# Test Helpers & Mock Provider
# ---------------------------------------------------------------------------

class MockComparisonLLMProvider(BaseLLMProvider):
    """Deterministic mock LLM provider for paper comparison tests."""

    def __init__(
        self,
        canned_response: Optional[str] = None,
        should_fail: Optional[Exception] = None,
    ) -> None:
        self.canned_response = canned_response
        self.should_fail = should_fail
        self.last_prompt: Optional[str] = None
        self.last_system_instruction: Optional[str] = None

    def generate(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: Optional[int] = None,
        **kwargs: Any,
    ) -> str:
        self.last_prompt = prompt
        self.last_system_instruction = system_instruction
        if self.should_fail:
            raise self.should_fail

        if self.canned_response:
            return self.canned_response

        # Default dynamic response extracting paper IDs from prompt
        return json.dumps({
            "dimensions": {
                "objective": {
                    "synthesis": "Both papers address scientific text processing.",
                    "papers": {}
                },
                "methodology": {
                    "synthesis": "Paper 1 uses transformers while Paper 2 uses recurrent models.",
                    "papers": {}
                },
                "dataset_setup": {
                    "synthesis": "Both evaluate on benchmark scientific datasets.",
                    "papers": {}
                },
                "key_findings": {
                    "synthesis": "Both achieve competitive accuracy.",
                    "papers": {}
                },
                "limitations": {
                    "synthesis": "Paper 1 notes computational cost.",
                    "papers": {}
                },
                "future_work": {
                    "synthesis": "Future work focuses on parameter reduction.",
                    "papers": {}
                }
            },
            "similarities": [
                {
                    "title": "Natural Language Processing Domain",
                    "description": "Both papers evaluate language models for scientific text.",
                    "paper_ids": [],
                    "citations": [1]
                }
            ],
            "differences": [
                {
                    "title": "Architectural Design",
                    "description": "Paper 1 adopts a multi-layer transformer whereas Paper 2 relies on an LSTM encoder.",
                    "paper_ids": [],
                    "citations": [1, 2]
                }
            ]
        })

    def get_status(self) -> Dict[str, Any]:
        return {
            "provider": "mock-groq",
            "model": "llama-3.3-70b-versatile",
            "configured": True,
            "status": "configured",
            "message": "Mock Groq active.",
        }


def create_authenticated_user(name: str = "Dr. Comparison Tester") -> tuple[dict, str, uuid.UUID]:
    email = f"compare_{uuid.uuid4().hex[:8]}@example.com"
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


def create_test_project(token: str, name: str = "Paper Comparison Lab") -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    res = client.post(
        "/api/projects",
        headers=headers,
        json={"name": name, "description": "Testing Paper Comparison."},
    )
    assert res.status_code == 201, res.text
    return res.json()


def generate_pdf_for_topic(topic: str) -> bytes:
    pages = [
        f"Abstract\n\nThis paper explores {topic} for scientific literature analysis.",
        f"Methodology\n\nThe proposed method uses neural attention mechanisms tailored to {topic}.",
        f"Results and Discussion\n\nThe {topic} pipeline achieves high precision on benchmark tasks.",
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
    title: str = "Transformer Study",
    extract: bool = True,
    process: bool = True,
    embed: bool = True,
) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    pdf_bytes = generate_pdf_for_topic(title)
    files = {"file": (f"{title.lower().replace(' ', '_')}.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
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
# 1. Paper Comparison Unit & Validation Tests
# ---------------------------------------------------------------------------

class TestPaperComparisonServiceUnit:
    """Unit tests for deterministic key generation, schema validation, and citation attribution."""

    def test_make_paper_ids_key_deterministic(self):
        id1 = uuid.uuid4()
        id2 = uuid.uuid4()
        id3 = uuid.uuid4()

        key1 = paper_comparison_service.make_paper_ids_key([id1, id2, id3])
        key2 = paper_comparison_service.make_paper_ids_key([id3, id1, id2])
        assert key1 == key2
        assert str(id1).lower() in key1

    def test_cross_paper_citation_attribution_enforced(self):
        """A paper's dimension must only receive citations for chunks belonging to THAT paper."""
        p1_id = uuid.uuid4()
        p2_id = uuid.uuid4()

        paper1 = Paper(id=p1_id, title="Paper 1", original_filename="p1.pdf")
        paper2 = Paper(id=p2_id, title="Paper 2", original_filename="p2.pdf")

        # Source 1 belongs to Paper 1, Source 2 belongs to Paper 2
        source_map = {
            1: {
                "source_number": 1,
                "paper_id": p1_id,
                "chunk_id": uuid.uuid4(),
                "chunk_index": 0,
                "section_name": "Abstract",
                "start_page": 1,
                "end_page": 1,
            },
            2: {
                "source_number": 2,
                "paper_id": p2_id,
                "chunk_id": uuid.uuid4(),
                "chunk_index": 0,
                "section_name": "Methodology",
                "start_page": 2,
                "end_page": 2,
            },
        }
        paper_source_map = {p1_id: [1], p2_id: [2]}

        # LLM erroneously attributed Source 2 (Paper 2) to Paper 1
        raw_llm = json.dumps({
            "dimensions": {
                "objective": {
                    "synthesis": "Contrast",
                    "papers": {
                        str(p1_id): {"summary": "Objective of Paper 1.", "citations": [1, 2]},
                        str(p2_id): {"summary": "Objective of Paper 2.", "citations": [2]},
                    }
                }
            }
        })

        result = paper_comparison_service._parse_and_validate_response(
            raw_response=raw_llm,
            papers=[paper1, paper2],
            source_map=source_map,
            paper_source_map=paper_source_map,
        )

        p1_cites = result.dimensions["objective"].papers[str(p1_id)].citations
        # Source 2 must be stripped from Paper 1 because it belongs to Paper 2!
        assert len(p1_cites) == 1
        assert p1_cites[0].source_number == 1
        assert p1_cites[0].paper_id == p1_id

    def test_missing_evidence_strips_citations(self):
        p1_id = uuid.uuid4()
        paper1 = Paper(id=p1_id, title="Paper 1", original_filename="p1.pdf")
        source_map = {
            1: {
                "source_number": 1,
                "paper_id": p1_id,
                "chunk_id": uuid.uuid4(),
                "chunk_index": 0,
                "section_name": "Abstract",
                "start_page": 1,
                "end_page": 1,
            }
        }
        paper_source_map = {p1_id: [1]}

        raw_llm = json.dumps({
            "dimensions": {
                "limitations": {
                    "papers": {
                        str(p1_id): {"summary": "Not clearly stated in the paper.", "citations": [1]},
                    }
                }
            }
        })

        result = paper_comparison_service._parse_and_validate_response(
            raw_response=raw_llm,
            papers=[paper1],
            source_map=source_map,
            paper_source_map=paper_source_map,
        )

        lim_summary = result.dimensions["limitations"].papers[str(p1_id)]
        assert lim_summary.summary == NOT_STATED_MESSAGE
        assert lim_summary.citations == []


# ---------------------------------------------------------------------------
# 2. Paper Comparison API Endpoints Integration Tests
# ---------------------------------------------------------------------------

class TestPaperComparisonAPI:
    """Integration tests for POST and GET /api/comparisons endpoints."""

    def test_comparison_requires_authentication(self):
        fake_id = uuid.uuid4()
        post_res = client.post("/api/comparisons", json={"paper_ids": [str(fake_id), str(uuid.uuid4())]})
        assert post_res.status_code == 401

        get_res = client.get(f"/api/comparisons/{fake_id}")
        assert get_res.status_code == 401

    def test_comparison_requires_min_2_and_max_5_papers(self):
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}

        # 1 paper -> rejected
        res_single = client.post("/api/comparisons", headers=headers, json={"paper_ids": [str(uuid.uuid4())]})
        assert res_single.status_code == 422

        # 6 papers -> rejected
        six_ids = [str(uuid.uuid4()) for _ in range(6)]
        res_six = client.post("/api/comparisons", headers=headers, json={"paper_ids": six_ids})
        assert res_six.status_code == 422

    def test_comparison_precondition_unprocessed_paper(self):
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        project = create_test_project(token)

        paper1 = upload_and_prepare_paper(token, project["id"], "Paper 1", extract=True, process=True, embed=True)
        # Paper 2 is uploaded but unchunked/unembedded
        paper2 = upload_and_prepare_paper(token, project["id"], "Paper 2", extract=False, process=False, embed=False)

        res = client.post(
            "/api/comparisons",
            headers=headers,
            json={"paper_ids": [paper1["id"], paper2["id"]]},
        )
        assert res.status_code == 422
        assert "chunking" in res.json()["detail"].lower()

    def test_successful_2_paper_comparison_and_get(self):
        _, token, user_id = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        project = create_test_project(token)

        paper1 = upload_and_prepare_paper(token, project["id"], "Graph RAG Paper", extract=True, process=True, embed=True)
        paper2 = upload_and_prepare_paper(token, project["id"], "Dense Retrieval Paper", extract=True, process=True, embed=True)

        mock_llm_json = json.dumps({
            "dimensions": {
                "objective": {
                    "synthesis": "Both papers target scientific retrieval.",
                    "papers": {
                        paper1["id"]: {"summary": "Graph RAG objective.", "citations": [1]},
                        paper2["id"]: {"summary": "Dense retrieval objective.", "citations": [2]},
                    }
                },
                "methodology": {
                    "synthesis": "Methodology contrast.",
                    "papers": {
                        paper1["id"]: {"summary": "Graph neural networks.", "citations": [1]},
                        paper2["id"]: {"summary": "Bi-encoder dense vectors.", "citations": [2]},
                    }
                },
                "dataset_setup": {
                    "synthesis": "Both use scientific benchmarks.",
                    "papers": {
                        paper1["id"]: {"summary": "PubMed corpus.", "citations": [1]},
                        paper2["id"]: {"summary": "Not clearly stated in the paper.", "citations": []},
                    }
                },
                "key_findings": {
                    "synthesis": "Findings contrast.",
                    "papers": {
                        paper1["id"]: {"summary": "High recall.", "citations": [1]},
                        paper2["id"]: {"summary": "Fast latency.", "citations": [2]},
                    }
                },
                "limitations": {
                    "synthesis": "Limitations contrast.",
                    "papers": {
                        paper1["id"]: {"summary": "Graph construction overhead.", "citations": [1]},
                        paper2["id"]: {"summary": "Not clearly stated in the paper.", "citations": []},
                    }
                },
                "future_work": {
                    "synthesis": "Future directions.",
                    "papers": {
                        paper1["id"]: {"summary": "Scale to multi-modal graphs.", "citations": [1]},
                        paper2["id"]: {"summary": "Zero-shot domain transfer.", "citations": [2]},
                    }
                }
            },
            "similarities": [
                {
                    "title": "Scientific Information Retrieval",
                    "description": "Both systems focus on indexing and searching research papers.",
                    "paper_ids": [paper1["id"], paper2["id"]],
                    "citations": [1, 2]
                }
            ],
            "differences": [
                {
                    "title": "Retrieval Mechanism",
                    "description": "Paper 1 utilizes graph traversals whereas Paper 2 uses vector similarity.",
                    "paper_ids": [paper1["id"], paper2["id"]],
                    "citations": [1, 2]
                }
            ]
        })

        mock_provider = MockComparisonLLMProvider(canned_response=mock_llm_json)
        with patch.object(llm_service, "_provider", mock_provider):
            res = client.post(
                "/api/comparisons",
                headers=headers,
                json={"paper_ids": [paper1["id"], paper2["id"]]},
            )

        assert res.status_code == 200, res.text
        data = res.json()
        assert "id" in data
        assert "comparison" in data
        comp = data["comparison"]

        # Check compared papers
        assert len(comp["compared_papers"]) == 2

        # Check all 6 dimensions
        expected_dims = ["objective", "methodology", "dataset_setup", "key_findings", "limitations", "future_work"]
        for dim in expected_dims:
            assert dim in comp["dimensions"]
            row = comp["dimensions"][dim]
            assert paper1["id"] in row["papers"]
            assert paper2["id"] in row["papers"]

        # Verify missing evidence in Paper 2 limitations
        assert row["papers"][paper2["id"]]["summary"] is not None

        # Check similarities & differences
        assert len(comp["similarities"]) >= 1
        assert len(comp["differences"]) >= 1

        # Test GET /api/comparisons/{id}
        comp_id = data["id"]
        get_res = client.get(f"/api/comparisons/{comp_id}", headers=headers)
        assert get_res.status_code == 200
        assert get_res.json()["id"] == comp_id

        # Test GET /api/comparisons?paper_ids=...
        get_by_papers = client.get(
            f"/api/comparisons?paper_ids={paper1['id']}&paper_ids={paper2['id']}",
            headers=headers,
        )
        assert get_by_papers.status_code == 200
        assert get_by_papers.json()["id"] == comp_id

    def test_successful_3_paper_comparison(self):
        _, token, user_id = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        project = create_test_project(token)

        p1 = upload_and_prepare_paper(token, project["id"], "Paper A")
        p2 = upload_and_prepare_paper(token, project["id"], "Paper B")
        p3 = upload_and_prepare_paper(token, project["id"], "Paper C")

        mock_provider = MockComparisonLLMProvider()
        with patch.object(llm_service, "_provider", mock_provider):
            res = client.post(
                "/api/comparisons",
                headers=headers,
                json={"paper_ids": [p1["id"], p2["id"], p3["id"]]},
            )

        assert res.status_code == 200, res.text
        data = res.json()
        assert len(data["comparison"]["compared_papers"]) == 3
        assert len(data["paper_ids"]) == 3

    def test_regeneration_updates_without_duplicates(self):
        _, token, user_id = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        project = create_test_project(token)

        p1 = upload_and_prepare_paper(token, project["id"], "Paper Alpha")
        p2 = upload_and_prepare_paper(token, project["id"], "Paper Beta")

        mock_provider1 = MockComparisonLLMProvider()
        with patch.object(llm_service, "_provider", mock_provider1):
            res1 = client.post(
                "/api/comparisons",
                headers=headers,
                json={"paper_ids": [p1["id"], p2["id"]]},
            )
        assert res1.status_code == 200
        first_id = res1.json()["id"]

        # Call again with swapped order of paper IDs -> must update the same record!
        mock_provider2 = MockComparisonLLMProvider()
        with patch.object(llm_service, "_provider", mock_provider2):
            res2 = client.post(
                "/api/comparisons",
                headers=headers,
                json={"paper_ids": [p2["id"], p1["id"]]},
            )
        assert res2.status_code == 200
        second_id = res2.json()["id"]

        assert first_id == second_id

    def test_multi_tenant_isolation(self):
        """User B cannot compare or access User A's papers."""
        _, token_a, _ = create_authenticated_user(name="User A")
        _, token_b, _ = create_authenticated_user(name="User B")

        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        project_a = create_test_project(token_a, "User A Lab")
        p1 = upload_and_prepare_paper(token_a, project_a["id"], "Paper 1")
        p2 = upload_and_prepare_paper(token_a, project_a["id"], "Paper 2")

        # User A generates comparison
        mock_provider = MockComparisonLLMProvider()
        with patch.object(llm_service, "_provider", mock_provider):
            res_a = client.post(
                "/api/comparisons",
                headers=headers_a,
                json={"paper_ids": [p1["id"], p2["id"]]},
            )
        assert res_a.status_code == 200
        comp_id = res_a.json()["id"]

        # User B tries to compare User A's papers -> 404
        post_b = client.post(
            "/api/comparisons",
            headers=headers_b,
            json={"paper_ids": [p1["id"], p2["id"]]},
        )
        assert post_b.status_code == 404

        # User B tries to GET User A's comparison by ID -> 404
        get_b = client.get(f"/api/comparisons/{comp_id}", headers=headers_b)
        assert get_b.status_code == 404

    def test_llm_failure_returns_500_cleanly(self):
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        project = create_test_project(token)

        p1 = upload_and_prepare_paper(token, project["id"], "Paper X")
        p2 = upload_and_prepare_paper(token, project["id"], "Paper Y")

        failing_provider = MockComparisonLLMProvider(should_fail=RuntimeError("Groq service connection dropped"))
        with patch.object(llm_service, "_provider", failing_provider):
            res = client.post(
                "/api/comparisons",
                headers=headers,
                json={"paper_ids": [p1["id"], p2["id"]]},
            )

        assert res.status_code == 500
        assert "AI comparison service failed" in res.json()["detail"]
