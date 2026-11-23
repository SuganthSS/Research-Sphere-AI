"""Targeted test suite for Module 11.1: Evidence-Grounded Research Gap Identification.

Covers:
1. limitation-derived gap
2. future-work-derived gap
3. cross-paper gap
4. every gap has valid PaperChunk evidence
5. invalid/fabricated citation rejected
6. ownership isolation
7. insufficient evidence returns safe result
8. conservative 'Potential Research Gap' wording
9. regeneration/idempotency
10. API response structure
"""
import json
import uuid
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.paper import Paper
from app.models.paper_chunk import PaperChunk
from app.models.project import Project
from app.models.research_gap import ResearchGapAnalysis
from app.db.session import SessionLocal
from app.schemas.research_gap import SCIENTIFIC_CAUTION_NOTICE
from app.services.llm.base import BaseLLMProvider
from app.services.llm.service import llm_service
from app.services.research_gap_service import ResearchGapService, research_gap_service

client = TestClient(app)


# ---------------------------------------------------------------------------
# Test Mocks & Helpers
# ---------------------------------------------------------------------------

class CapturingMockLLMProvider(BaseLLMProvider):
    """Mock LLM provider returning predetermined JSON responses."""

    def __init__(self, canned_json: Dict[str, Any]) -> None:
        self.canned_json = canned_json
        self.last_prompt: Optional[str] = None
        self.last_system_instruction: Optional[str] = None

    def generate(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: int = 1800,
    ) -> str:
        self.last_prompt = prompt
        self.last_system_instruction = system_instruction
        return json.dumps(self.canned_json)

    def get_status(self) -> Dict[str, Any]:
        return {
            "provider": "mock",
            "model": "mock-gap-analyst",
            "configured": True,
            "status": "configured",
            "message": "Mock active.",
        }


def setup_user_project_papers(num_papers: int = 2) -> tuple[dict, str, Project, List[Paper]]:
    """Helper creating user, project, papers, and limitation/future work chunks."""
    email = f"gapuser_{uuid.uuid4().hex[:8]}@example.com"
    password = "StrongPassword2026!"
    reg_res = client.post(
        "/api/auth/register",
        json={"name": "Dr. Gap Analyst", "email": email, "password": password},
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
            name="Gap Analysis Lab",
            description="Testing Module 11",
        )
        db.add(project)

        papers: List[Paper] = []
        for i in range(num_papers):
            paper = Paper(
                id=uuid.uuid4(),
                user_id=user_id,
                project_id=project.id,
                title=f"Scientific Study {i + 1}",
                original_filename=f"paper_{i + 1}.pdf",
                stored_filename=f"stored_{uuid.uuid4().hex}.pdf",
                file_size=2048,
                mime_type="application/pdf",
                status="processed",
                chunking_status="completed",
                embedding_status="completed",
            )
            db.add(paper)
            papers.append(paper)

            # Add limitation and future work chunks
            t1 = f"A major limitation of Study {i + 1} is that the evaluation was restricted to synthetic datasets and small sample sizes."
            chunk1 = PaperChunk(
                id=uuid.uuid4(),
                paper_id=paper.id,
                chunk_index=0,
                section_name="Limitations",
                start_page=5,
                end_page=5,
                text=t1,
                character_count=len(t1),
                token_count_estimate=len(t1.split()),
            )
            t2 = f"Future work should investigate real-world clinical benchmarks and cross-institutional generalization for Study {i + 1}."
            chunk2 = PaperChunk(
                id=uuid.uuid4(),
                paper_id=paper.id,
                chunk_index=1,
                section_name="Future Work",
                start_page=6,
                end_page=6,
                text=t2,
                character_count=len(t2),
                token_count_estimate=len(t2.split()),
            )
            db.add(chunk1)
            db.add(chunk2)

        db.commit()
        db.refresh(project)
        for p in papers:
            db.refresh(p)
        return user_data, token, project, papers
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Module 11 Targeted Tests
# ---------------------------------------------------------------------------

def test_1_limitation_derived_gap():
    """1. Limitation-Derived Gap identification."""
    user, token, project, papers = setup_user_project_papers(1)
    headers = {"Authorization": f"Bearer {token}"}

    canned = {
        "insufficient_evidence": False,
        "gaps": [
            {
                "title": "Synthetic Evaluation Generalization Constraint",
                "gap_type": "Limitation-Derived Gap",
                "potential_gap": "Potential Research Gap: The current architecture remains untested on real-world datasets.",
                "rationale": "Author explicitly notes limitation to synthetic datasets.",
                "why_it_matters": "Real-world transferability is critical for practical deployment.",
                "supporting_paper_ids": [str(papers[0].id)],
                "confidence": "High",
                "citation_source_numbers": [1],
            }
        ],
    }
    mock_llm = CapturingMockLLMProvider(canned)

    with patch("app.services.llm.service.llm_service._provider", mock_llm):
        res = client.post(
            f"/api/projects/{project.id}/gaps/analyze",
            headers=headers,
            json={"scope": "project"},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["total_gaps"] == 1
        gap = data["gaps"][0]
        assert gap["gap_type"] == "Limitation-Derived Gap"
        assert "Potential Research Gap" in gap["potential_gap"]
        assert len(gap["citations"]) == 1
        assert gap["citations"][0]["section_name"] == "Limitations"


def test_2_future_work_derived_gap():
    """2. Future-Work Gap identification."""
    user, token, project, papers = setup_user_project_papers(1)
    headers = {"Authorization": f"Bearer {token}"}

    canned = {
        "insufficient_evidence": False,
        "gaps": [
            {
                "title": "Cross-Institutional Clinical Benchmark Validation",
                "gap_type": "Future-Work Gap",
                "potential_gap": "Potential Research Gap: Cross-institutional generalization has been left as an open challenge.",
                "rationale": "Authors directly indicate future work is required on clinical benchmarks.",
                "why_it_matters": "Enables multi-site robustness.",
                "supporting_paper_ids": [str(papers[0].id)],
                "confidence": "Medium",
                "citation_source_numbers": [2],
            }
        ],
    }
    mock_llm = CapturingMockLLMProvider(canned)

    with patch("app.services.llm.service.llm_service._provider", mock_llm):
        res = client.post(
            f"/api/projects/{project.id}/gaps/analyze",
            headers=headers,
            json={"scope": "project"},
        )
        assert res.status_code == 200
        gap = res.json()["gaps"][0]
        assert gap["gap_type"] == "Future-Work Gap"
        assert gap["citations"][0]["section_name"] == "Future Work"


def test_3_cross_paper_gap():
    """3. Cross-Paper Inconsistency / Underexplored Connection gap."""
    user, token, project, papers = setup_user_project_papers(2)
    headers = {"Authorization": f"Bearer {token}"}

    canned = {
        "insufficient_evidence": False,
        "gaps": [
            {
                "title": "Contrasting Benchmark Assumptions Across Studies",
                "gap_type": "Cross-Paper Inconsistency / Underexplored Connection",
                "potential_gap": "Potential Research Gap: Both studies observe synthetic constraints but evaluate divergent assumptions.",
                "rationale": "Comparing Study 1 limitations with Study 2 highlights disjoint evaluations.",
                "why_it_matters": "Synthesizing cross-paper evaluation standards prevents fragmented progress.",
                "supporting_paper_ids": [str(papers[0].id), str(papers[1].id)],
                "confidence": "High",
                "citation_source_numbers": [1, 3],
            }
        ],
    }
    mock_llm = CapturingMockLLMProvider(canned)

    with patch("app.services.llm.service.llm_service._provider", mock_llm):
        res = client.post(
            f"/api/projects/{project.id}/gaps/analyze",
            headers=headers,
            json={"scope": "project"},
        )
        assert res.status_code == 200
        gap = res.json()["gaps"][0]
        assert gap["gap_type"] == "Cross-Paper Inconsistency / Underexplored Connection"
        assert len(gap["citations"]) == 2
        # Cites both papers
        paper_ids_cited = {c["paper_id"] for c in gap["citations"]}
        assert str(papers[0].id) in paper_ids_cited
        assert str(papers[1].id) in paper_ids_cited


def test_4_every_gap_has_valid_paperchunk_evidence():
    """4. Ensures every returned potential gap has at least one valid PaperChunk citation."""
    user, token, project, papers = setup_user_project_papers(1)
    headers = {"Authorization": f"Bearer {token}"}

    # LLM returns gap without citation numbers
    canned = {
        "insufficient_evidence": False,
        "gaps": [
            {
                "title": "Omitted Citation Gap",
                "gap_type": "Methodological Gap",
                "potential_gap": "Potential Research Gap: Scalability bounds remain unmeasured.",
                "rationale": "Inferred from complexity discussion.",
                "why_it_matters": "Computational budget limits adoption.",
                "supporting_paper_ids": [str(papers[0].id)],
                "confidence": "Low",
                "citation_source_numbers": [],
            }
        ],
    }
    mock_llm = CapturingMockLLMProvider(canned)

    with patch("app.services.llm.service.llm_service._provider", mock_llm):
        res = client.post(
            f"/api/projects/{project.id}/gaps/analyze",
            headers=headers,
            json={"scope": "project"},
        )
        assert res.status_code == 200
        gap = res.json()["gaps"][0]
        # Service guarantees fallback to authoritative chunk so gap is never evidence-less
        assert len(gap["citations"]) >= 1
        assert "chunk_id" in gap["citations"][0]
        assert gap["citations"][0]["start_page"] > 0


def test_5_invalid_fabricated_citation_rejected():
    """5. Hallucinated or non-existent citation numbers are strictly stripped."""
    user, token, project, papers = setup_user_project_papers(1)
    headers = {"Authorization": f"Bearer {token}"}

    # LLM hallucinates source number [999] along with valid [1]
    canned = {
        "insufficient_evidence": False,
        "gaps": [
            {
                "title": "Fabrication Test Gap",
                "gap_type": "Limitation-Derived Gap",
                "potential_gap": "Potential Research Gap: Testing citation sanitization.",
                "rationale": "Rationale referencing [1] and [999].",
                "why_it_matters": "Sanitizing fake citations.",
                "supporting_paper_ids": [str(papers[0].id)],
                "confidence": "Medium",
                "citation_source_numbers": [1, 999],
            }
        ],
    }
    mock_llm = CapturingMockLLMProvider(canned)

    with patch("app.services.llm.service.llm_service._provider", mock_llm):
        res = client.post(
            f"/api/projects/{project.id}/gaps/analyze",
            headers=headers,
            json={"scope": "project"},
        )
        assert res.status_code == 200
        gap = res.json()["gaps"][0]
        cites = gap["citations"]
        assert len(cites) == 1
        assert cites[0]["source_number"] == 1


def test_6_ownership_isolation():
    """6. Multi-tenant security: User B cannot access or analyze User A's project."""
    user_a, token_a, proj_a, papers_a = setup_user_project_papers(1)
    user_b, token_b, proj_b, papers_b = setup_user_project_papers(1)
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User B attempts to analyze User A's project
    res_analyze = client.post(
        f"/api/projects/{proj_a.id}/gaps/analyze",
        headers=headers_b,
        json={"scope": "project"},
    )
    assert res_analyze.status_code == 404

    # User B attempts to read User A's latest gaps
    res_get = client.get(
        f"/api/projects/{proj_a.id}/gaps/latest",
        headers=headers_b,
    )
    assert res_get.status_code == 404


def test_7_insufficient_evidence_returns_safe_result():
    """7. Returns truthful insufficient evidence without speculating when corpus is empty or indecisive."""
    user, token, project, papers = setup_user_project_papers(1)
    headers = {"Authorization": f"Bearer {token}"}

    canned = {
        "insufficient_evidence": True,
        "insufficient_evidence_reason": "No explicit limitations or open directions reported.",
        "gaps": [],
    }
    mock_llm = CapturingMockLLMProvider(canned)

    with patch("app.services.llm.service.llm_service._provider", mock_llm):
        res = client.post(
            f"/api/projects/{project.id}/gaps/analyze",
            headers=headers,
            json={"scope": "project"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["insufficient_evidence"] is True
        assert data["total_gaps"] == 0
        assert "explicit limitations" in data["insufficient_evidence_reason"]


def test_8_conservative_wording_enforced():
    """8. Conservative 'Potential Research Gap' prefix and phrasing enforced."""
    user, token, project, papers = setup_user_project_papers(1)
    headers = {"Authorization": f"Bearer {token}"}

    # LLM returns dogmatic statement without 'Potential'
    canned = {
        "insufficient_evidence": False,
        "gaps": [
            {
                "title": "Dogmatic Statement Check",
                "gap_type": "Methodological Gap",
                "potential_gap": "There is a definitive gap here.",
                "rationale": "Derived from evidence.",
                "why_it_matters": "Significance.",
                "supporting_paper_ids": [str(papers[0].id)],
                "confidence": "Medium",
                "citation_source_numbers": [1],
            }
        ],
    }
    mock_llm = CapturingMockLLMProvider(canned)

    with patch("app.services.llm.service.llm_service._provider", mock_llm):
        res = client.post(
            f"/api/projects/{project.id}/gaps/analyze",
            headers=headers,
            json={"scope": "project"},
        )
        assert res.status_code == 200
        gap = res.json()["gaps"][0]
        # Service prepends "Potential Research Gap: "
        assert gap["potential_gap"].startswith("Potential Research Gap:")
        assert res.json()["caution_notice"] == SCIENTIFIC_CAUTION_NOTICE


def test_9_regeneration_and_idempotency():
    """9. Caching on repeat requests and version incrementing on forced regeneration."""
    user, token, project, papers = setup_user_project_papers(1)
    headers = {"Authorization": f"Bearer {token}"}

    canned = {
        "insufficient_evidence": False,
        "gaps": [
            {
                "title": "Idempotency Gap",
                "gap_type": "Limitation-Derived Gap",
                "potential_gap": "Potential Research Gap: Testing cache.",
                "rationale": "Rationale [1].",
                "why_it_matters": "Matters.",
                "supporting_paper_ids": [str(papers[0].id)],
                "confidence": "Medium",
                "citation_source_numbers": [1],
            }
        ],
    }
    mock_llm = CapturingMockLLMProvider(canned)

    with patch("app.services.llm.service.llm_service._provider", mock_llm):
        # Initial analysis (version 1)
        res1 = client.post(
            f"/api/projects/{project.id}/gaps/analyze",
            headers=headers,
            json={"scope": "project", "force_regenerate": False},
        )
        assert res1.status_code == 200
        assert res1.json()["version"] == 1

        # Second call without force_regenerate returns cached version 1 without calling LLM again
        mock_llm.generate = MagicMock(side_effect=Exception("Should not be called when cached"))
        res2 = client.post(
            f"/api/projects/{project.id}/gaps/analyze",
            headers=headers,
            json={"scope": "project", "force_regenerate": False},
        )
        assert res2.status_code == 200
        assert res2.json()["version"] == 1
        assert res2.json()["id"] == res1.json()["id"]

        # Third call with force_regenerate creates version 2
        mock_llm.generate = MagicMock(return_value=json.dumps(canned))
        res3 = client.post(
            f"/api/projects/{project.id}/gaps/analyze",
            headers=headers,
            json={"scope": "project", "force_regenerate": True},
        )
        assert res3.status_code == 200
        assert res3.json()["version"] == 2


def test_10_api_response_structure():
    """10. Complete API response structure matches requirements."""
    user, token, project, papers = setup_user_project_papers(1)
    headers = {"Authorization": f"Bearer {token}"}

    canned = {
        "insufficient_evidence": False,
        "gaps": [
            {
                "title": "Structure Validation Gap",
                "gap_type": "Dataset / Evaluation Gap",
                "potential_gap": "Potential Research Gap: Benchmark diversity constraint.",
                "rationale": "Corpus uses single dataset [1].",
                "why_it_matters": "Evaluation realism.",
                "supporting_paper_ids": [str(papers[0].id)],
                "confidence": "High",
                "citation_source_numbers": [1],
            }
        ],
    }
    mock_llm = CapturingMockLLMProvider(canned)

    with patch("app.services.llm.service.llm_service._provider", mock_llm):
        res = client.post(
            f"/api/projects/{project.id}/gaps/analyze",
            headers=headers,
            json={"scope": "project"},
        )
        assert res.status_code == 200
        data = res.json()

        expected_keys = [
            "id",
            "project_id",
            "paper_ids",
            "gaps",
            "total_gaps",
            "insufficient_evidence",
            "insufficient_evidence_reason",
            "caution_notice",
            "model_provider",
            "model_name",
            "version",
            "created_at",
            "updated_at",
        ]
        for k in expected_keys:
            assert k in data, f"Missing key: {k}"

        gap_item = data["gaps"][0]
        gap_expected_keys = [
            "id",
            "title",
            "gap_type",
            "potential_gap",
            "rationale",
            "why_it_matters",
            "supporting_papers",
            "confidence",
            "citations",
        ]
        for gk in gap_expected_keys:
            assert gk in gap_item, f"Missing gap key: {gk}"

        cite_item = gap_item["citations"][0]
        cite_expected_keys = [
            "source_number",
            "paper_id",
            "paper_title",
            "chunk_id",
            "chunk_index",
            "section_name",
            "start_page",
            "end_page",
            "text",
        ]
        for ck in cite_expected_keys:
            assert ck in cite_item, f"Missing citation key: {ck}"
