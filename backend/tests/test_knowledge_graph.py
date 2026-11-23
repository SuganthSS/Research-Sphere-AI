"""Targeted unit and integration tests for Module 9.1:
FAST Scientific Knowledge Graph.

Covers:
1. Entity extraction validation (schema conformity)
2. Graph upsert (Paper -> Authors/Topics/Methods/Datasets)
3. Duplicate prevention on regeneration
4. Ownership isolation (multi-tenant security)
5. Graph retrieval endpoint
6. Malformed Groq response handling
7. Neo4j unavailable graceful handling & status endpoint
"""
import io
import json
import uuid
from typing import Any, Dict, List, Optional
from unittest.mock import patch, MagicMock
import pytest
import pymupdf
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import SessionLocal
from app.models.paper_graph import PaperGraph
from app.schemas.graph import GraphNode, GraphEdge
from app.services.llm.base import BaseLLMProvider
from app.services.llm.service import llm_service
from app.services.neo4j_service import neo4j_service
from app.services.knowledge_graph_service import (
    knowledge_graph_service,
    KnowledgeGraphPreconditionError,
)

client = TestClient(app)


class MockGraphLLMProvider(BaseLLMProvider):
    """Deterministic mock LLM provider for Knowledge Graph entity extraction."""

    def __init__(self, canned_response: Optional[str] = None, should_fail: Optional[Exception] = None) -> None:
        self.canned_response = canned_response
        self.should_fail = should_fail

    def generate(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: Optional[int] = None,
        **kwargs: Any,
    ) -> str:
        if self.should_fail:
            raise self.should_fail

        if self.canned_response:
            return self.canned_response

        return json.dumps({
            "authors": ["Alice Smith", "Bob Jones"],
            "topics": ["Biomedical NLP", "Information Retrieval"],
            "methods": ["Graph Convolutional Network", "Dense Vector Search"],
            "datasets": ["PubMed Corpus"],
            "related_topics": [["Biomedical NLP", "Information Retrieval"]]
        })

    def get_status(self) -> Dict[str, Any]:
        return {"provider": "mock-groq", "model": "mock", "configured": True}


def create_authenticated_user(name: str = "Dr. Graph Researcher") -> tuple[dict, str, uuid.UUID]:
    email = f"graph_{uuid.uuid4().hex[:8]}@example.com"
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


def create_test_project(token: str, name: str = "Knowledge Graph Lab") -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    res = client.post(
        "/api/projects",
        headers=headers,
        json={"name": name, "description": "Testing Knowledge Graph."},
    )
    assert res.status_code == 201, res.text
    return res.json()


def generate_pdf_for_graph(title: str) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text(
        (50, 72),
        f"{title}\n\nBy Alice Smith and Bob Jones\n\nAbstract\n"
        f"This paper introduces Graph Convolutional Networks evaluated on the PubMed Corpus for Biomedical NLP.",
        fontsize=11,
    )
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def upload_and_prepare_paper(token: str, project_id: str, title: str) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    pdf_bytes = generate_pdf_for_graph(title)
    files = {"file": (f"{title.lower().replace(' ', '_')}.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    upload_res = client.post(f"/api/projects/{project_id}/papers", headers=headers, files=files)
    assert upload_res.status_code == 201, upload_res.text
    paper = upload_res.json()
    paper_id = paper["id"]

    ext_res = client.post(f"/api/papers/{paper_id}/extract", headers=headers)
    assert ext_res.status_code == 200, ext_res.text

    proc_res = client.post(f"/api/papers/{paper_id}/process", headers=headers)
    assert proc_res.status_code == 200, proc_res.text

    return paper


class TestKnowledgeGraph:
    """Test suite for Module 9.1 Knowledge Graph functionality."""

    def test_entity_extraction_validation(self):
        """1. Validates that extracted JSON maps cleanly to standard nodes and edges."""
        raw_json = json.dumps({
            "authors": ["Dr. Angela Davis"],
            "topics": ["Quantum Computing"],
            "methods": ["Shor's Algorithm"],
            "datasets": ["QASM Benchmark"],
            "related_topics": [["Quantum Computing", "Cryptography"]]
        })
        parsed = knowledge_graph_service._parse_entities(raw_json)
        assert "Dr. Angela Davis" in parsed["authors"]
        assert "Quantum Computing" in parsed["topics"]
        assert "Shor's Algorithm" in parsed["methods"]
        assert "QASM Benchmark" in parsed["datasets"]

    def test_graph_upsert(self):
        """2. Tests successful graph generation and upsert for a processed paper."""
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        project = create_test_project(token)
        paper = upload_and_prepare_paper(token, project["id"], "GNN for Biomedical Literature")

        mock_provider = MockGraphLLMProvider()
        with patch.object(llm_service, "_provider", mock_provider), \
             patch.object(neo4j_service, "is_available", return_value=True), \
             patch.object(neo4j_service, "upsert_paper_graph", return_value=True):
            res = client.post(
                f"/api/graphs/papers/{paper['id']}/generate",
                headers=headers,
            )
            assert res.status_code == 200, res.text
            data = res.json()
            assert data["paper_id"] == paper["id"]
            assert data["neo4j_synced"] is True

            node_labels = {n["label"] for n in data["nodes"]}
            assert "Paper" in node_labels
            assert "Author" in node_labels
            assert "Topic" in node_labels
            assert "Method" in node_labels
            assert "Dataset" in node_labels

            edge_labels = {e["label"] for e in data["edges"]}
            assert "AUTHORED_BY" in edge_labels
            assert "DISCUSSES" in edge_labels
            assert "USES_METHOD" in edge_labels
            assert "USES_DATASET" in edge_labels

    def test_duplicate_prevention_on_regeneration(self):
        """3. Re-generating graph updates the existing row without duplicate records."""
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        project = create_test_project(token)
        paper = upload_and_prepare_paper(token, project["id"], "Duplicate Check Study")

        mock_provider = MockGraphLLMProvider()
        with patch.object(llm_service, "_provider", mock_provider), \
             patch.object(neo4j_service, "is_available", return_value=False):
            # Run 1
            res1 = client.post(f"/api/graphs/papers/{paper['id']}/generate", headers=headers)
            assert res1.status_code == 200
            # Run 2 (Regeneration)
            res2 = client.post(f"/api/graphs/papers/{paper['id']}/generate", headers=headers)
            assert res2.status_code == 200

        db = SessionLocal()
        records = db.query(PaperGraph).filter(PaperGraph.paper_id == uuid.UUID(paper["id"])).all()
        db.close()
        assert len(records) == 1, "Expected exactly 1 PaperGraph record in PostgreSQL"

    def test_ownership_isolation(self):
        """4. User B cannot generate or retrieve User A's paper graph."""
        _, token_a, _ = create_authenticated_user(name="User A")
        _, token_b, _ = create_authenticated_user(name="User B")
        headers_b = {"Authorization": f"Bearer {token_b}"}

        project_a = create_test_project(token_a, "User A Lab")
        paper_a = upload_and_prepare_paper(token_a, project_a["id"], "Secret Paper A")

        # User B attempts to generate User A's paper graph
        res_gen = client.post(
            f"/api/graphs/papers/{paper_a['id']}/generate",
            headers=headers_b,
        )
        assert res_gen.status_code == 404

        # User B attempts to retrieve User A's paper graph
        res_get = client.get(
            f"/api/graphs/papers/{paper_a['id']}",
            headers=headers_b,
        )
        assert res_get.status_code == 404

    def test_graph_retrieval(self):
        """5. Successfully retrieves existing graph from GET /api/graphs/papers/{paper_id}."""
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        project = create_test_project(token)
        paper = upload_and_prepare_paper(token, project["id"], "Retrieval Test Paper")

        mock_provider = MockGraphLLMProvider()
        with patch.object(llm_service, "_provider", mock_provider):
            gen_res = client.post(f"/api/graphs/papers/{paper['id']}/generate", headers=headers)
            assert gen_res.status_code == 200

        get_res = client.get(f"/api/graphs/papers/{paper['id']}", headers=headers)
        assert get_res.status_code == 200
        data = get_res.json()
        assert data["paper_id"] == paper["id"]
        assert len(data["nodes"]) >= 1

    def test_malformed_groq_response_handled_gracefully(self):
        """6. Malformed or partial LLM response does not crash graph generation."""
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        project = create_test_project(token)
        paper = upload_and_prepare_paper(token, project["id"], "Malformed LLM Paper")

        bad_provider = MockGraphLLMProvider(canned_response="This is plain text with no JSON at all.")
        with patch.object(llm_service, "_provider", bad_provider):
            res = client.post(f"/api/graphs/papers/{paper['id']}/generate", headers=headers)
            assert res.status_code == 200
            data = res.json()
            # Paper node should always be present even if entity extraction returned empty
            assert any(n["label"] == "Paper" for n in data["nodes"])

    def test_neo4j_unavailable_handling_and_status(self):
        """7. When Neo4j is unavailable, returns clean status and saves to PostgreSQL with neo4j_synced=False."""
        # Check status endpoint
        with patch.object(neo4j_service, "get_status") as mock_status:
            from app.schemas.graph import Neo4jStatusResponse
            mock_status.return_value = Neo4jStatusResponse(
                status="Not configured",
                uri="bolt://localhost:7687",
                message="Neo4j credentials not configured",
            )
            res = client.get("/api/graphs/status")
            assert res.status_code == 200
            assert res.json()["status"] == "Not configured"

        # Check generate with Neo4j offline
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        project = create_test_project(token)
        paper = upload_and_prepare_paper(token, project["id"], "Offline Neo4j Paper")

        mock_provider = MockGraphLLMProvider()
        with patch.object(llm_service, "_provider", mock_provider), \
             patch.object(neo4j_service, "is_available", return_value=False):
            res = client.post(f"/api/graphs/papers/{paper['id']}/generate", headers=headers)
            assert res.status_code == 200
            assert res.json()["neo4j_synced"] is False
