"""Targeted test suite for Module 10.1: Fast Hybrid GraphRAG.

Covers:
1. Vector + Graph retrieval combined
2. Graph context relevant to selected paper/project
3. Citation validation remains PaperChunk-based (no fake graph citations)
4. Ownership isolation (strictly prevents cross-user graph traversal)
5. Controlled 1-2 hop Neo4j traversal
6. Neo4j unavailable -> standard RAG fallback
7. Malformed/empty graph result handling
8. Existing standard RAG mode remains functional
9. GraphRAG API response metadata
"""
import uuid
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.paper import Paper
from app.models.project import Project
from app.db.session import SessionLocal
from app.services.graph_rag_service import GraphRAGService, graph_rag_service
from app.services.llm.base import BaseLLMProvider
from app.services.llm.service import llm_service
from app.services.neo4j_service import Neo4jService, neo4j_service
from app.schemas.graph import Neo4jStatusResponse

client = TestClient(app)


# ---------------------------------------------------------------------------
# Test Mocks & Helpers
# ---------------------------------------------------------------------------

class CapturingMockLLMProvider(BaseLLMProvider):
    """Mock LLM provider that captures prompts and system instructions."""

    def __init__(self, canned_response: str = "The model uses AdamW optimization [1].") -> None:
        self.canned_response = canned_response
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
        return self.canned_response

    def get_status(self) -> Dict[str, Any]:
        return {
            "provider": "mock",
            "model": "mock-graphrag",
            "configured": True,
            "status": "configured",
            "message": "Mock active.",
        }


def create_user_and_paper(title: str = "GraphRAG Paper") -> tuple[dict, str, Project, Paper]:
    """Helper creating authenticated user, project, and an embedded paper in DB."""
    email = f"graphrag_{uuid.uuid4().hex[:8]}@example.com"
    password = "StrongPassword2026!"
    reg_res = client.post(
        "/api/auth/register",
        json={"name": "Dr. Graph", "email": email, "password": password},
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
            name="Graph Research Lab",
            description="Testing GraphRAG",
        )
        db.add(project)

        paper = Paper(
            id=uuid.uuid4(),
            user_id=user_id,
            project_id=project.id,
            title=title,
            original_filename="paper.pdf",
            stored_filename=f"paper_{uuid.uuid4().hex}.pdf",
            file_size=1024,
            mime_type="application/pdf",
            status="processed",
            chunking_status="completed",
            embedding_status="completed",
        )
        db.add(paper)
        db.commit()
        db.refresh(project)
        db.refresh(paper)
        return user_data, token, project, paper
    finally:
        db.close()


def mock_vector_retrieval(paper_id: uuid.UUID) -> List[Dict[str, Any]]:
    """Generates standard mocked Qdrant chunk search results."""
    return [
        {
            "chunk_id": str(uuid.uuid4()),
            "paper_id": str(paper_id),
            "chunk_index": 0,
            "section_name": "Methodology",
            "start_page": 2,
            "end_page": 2,
            "score": 0.89,
            "text": "We evaluate Graph Neural Networks trained with AdamW optimization on benchmark datasets.",
        }
    ]


# ---------------------------------------------------------------------------
# Module 10 Targeted Tests
# ---------------------------------------------------------------------------

def test_1_vector_and_graph_retrieval_combined():
    """1. Vector + Graph retrieval combined into hybrid context."""
    user, token, project, paper = create_user_and_paper("Hybrid GraphRAG Foundations")
    headers = {"Authorization": f"Bearer {token}"}

    mock_llm = CapturingMockLLMProvider("Hybrid analysis shows AdamW optimization in GNNs [1].")
    mock_chunks = mock_vector_retrieval(paper.id)

    mock_graph_ctx = {
        "entities": ["AdamW", "GNN", "GraphRAG"],
        "relationships": [
            f"Paper '{paper.title}' USES_METHOD Method 'AdamW'",
            f"Paper '{paper.title}' DISCUSSES Topic 'GNN'",
        ],
        "context_text": f"- Paper '{paper.title}' USES_METHOD Method 'AdamW'\n- Paper '{paper.title}' DISCUSSES Topic 'GNN'",
    }

    with patch("app.services.llm.service.llm_service._provider", mock_llm), \
         patch("app.services.embedding.embedding_service.embed_query", return_value=[0.1] * 384), \
         patch("app.services.qdrant_service.qdrant_service.search", return_value=mock_chunks), \
         patch.object(neo4j_service, "is_available", return_value=True), \
         patch.object(neo4j_service, "get_graph_context", return_value=mock_graph_ctx):

        res = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={
                "question": "What methods and architectures are utilized?",
                "scope": "paper",
                "paper_id": str(paper.id),
                "mode": "graph",
            },
        )

        assert res.status_code == 200, res.text
        data = res.json()
        assert data["retrieval_mode"] == "graph"
        assert data["graph_context_used"] is True
        assert "AdamW" in data["graph_entities"]
        assert len(data["graph_relationships"]) == 2
        assert len(data["sources"]) == 1
        assert "[1]" in data["answer"]

        # Verify LLM prompt received both VECTOR EVIDENCE and GRAPH CONTEXT
        assert mock_llm.last_prompt is not None
        assert "VECTOR EVIDENCE:" in mock_llm.last_prompt
        assert "GRAPH CONTEXT:" in mock_llm.last_prompt
        assert "USES_METHOD Method 'AdamW'" in mock_llm.last_prompt


def test_2_graph_context_relevant_to_selected_paper_and_project():
    """2. Graph context is scoped strictly to selected paper (or project)."""
    user, token, project, paper = create_user_and_paper("Scoped Paper")
    headers = {"Authorization": f"Bearer {token}"}

    mock_llm = CapturingMockLLMProvider("Relevant findings [1].")
    mock_chunks = mock_vector_retrieval(paper.id)

    with patch("app.services.llm.service.llm_service._provider", mock_llm), \
         patch("app.services.embedding.embedding_service.embed_query", return_value=[0.1] * 384), \
         patch("app.services.qdrant_service.qdrant_service.search", return_value=mock_chunks), \
         patch.object(neo4j_service, "is_available", return_value=True), \
         patch.object(neo4j_service, "get_graph_context", return_value={"entities": [], "relationships": [], "context_text": ""}) as mock_get_graph:

        # Test single paper scope
        res_paper = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={
                "question": "What is covered?",
                "scope": "paper",
                "paper_id": str(paper.id),
                "mode": "graph",
            },
        )
        assert res_paper.status_code == 200
        mock_get_graph.assert_called_with(paper_ids=[str(paper.id)], max_relationships=30)

        # Test project scope
        res_proj = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={
                "question": "What is covered in project?",
                "scope": "project",
                "project_id": str(project.id),
                "mode": "graph",
            },
        )
        assert res_proj.status_code == 200
        # Project contains paper.id
        call_paper_ids = mock_get_graph.call_args[1]["paper_ids"]
        assert str(paper.id) in call_paper_ids


def test_3_citation_validation_remains_paperchunk_based():
    """3. Citation validation preserves real PaperChunks and eliminates hallucinated or graph citations."""
    user, token, project, paper = create_user_and_paper("Citation Check Paper")
    headers = {"Authorization": f"Bearer {token}"}

    # Canned LLM response references [1] (valid chunk) and [2], [99] (hallucinated / non-existent)
    mock_llm = CapturingMockLLMProvider("Methodology is described in [1]. Fake citation [2] and graph node [99].")
    mock_chunks = mock_vector_retrieval(paper.id)  # Only 1 chunk exists

    with patch("app.services.llm.service.llm_service._provider", mock_llm), \
         patch("app.services.embedding.embedding_service.embed_query", return_value=[0.1] * 384), \
         patch("app.services.qdrant_service.qdrant_service.search", return_value=mock_chunks), \
         patch.object(neo4j_service, "is_available", return_value=True), \
         patch.object(neo4j_service, "get_graph_context", return_value={"entities": ["TopicA"], "relationships": ["Paper DISCUSSES TopicA"], "context_text": "- Paper DISCUSSES TopicA"}):

        res = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={
                "question": "Cite the evidence",
                "scope": "paper",
                "paper_id": str(paper.id),
                "mode": "graph",
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert "[1]" in data["answer"]
        assert "[2]" not in data["answer"]
        assert "[99]" not in data["answer"]
        assert len(data["sources"]) == 1
        assert data["sources"][0]["chunk_index"] == 0


def test_4_ownership_isolation_blocks_cross_user_graph_traversal():
    """4. Strict multi-tenant security: User B cannot traverse User A's papers in Neo4j."""
    user_a, token_a, proj_a, paper_a = create_user_and_paper("User A Confidential Paper")
    user_b, token_b, proj_b, paper_b = create_user_and_paper("User B Paper")
    headers_b = {"Authorization": f"Bearer {token_b}"}

    with patch.object(neo4j_service, "get_graph_context") as mock_get_graph:
        # User B tries to query User A's paper in graph mode
        res = client.post(
            "/api/assistant/ask",
            headers=headers_b,
            json={
                "question": "Inspect unauthorized paper",
                "scope": "paper",
                "paper_id": str(paper_a.id),
                "mode": "graph",
            },
        )
        assert res.status_code == 404
        # Neo4j traversal was never invoked for User A's paper
        mock_get_graph.assert_not_called()


def test_5_controlled_1_2_hop_traversal():
    """5. Neo4jService controlled 1-2 hop query generation and record parsing."""
    service = Neo4jService()

    # Mock Neo4j driver and session
    mock_session = MagicMock()
    # 1-hop result
    rec_1hop = {
        "paper_name": "Attention Paper",
        "r_type": "USES_METHOD",
        "e_label": "Method",
        "e_name": "Self-Attention",
    }
    # 2-hop result
    rec_2hop = {
        "topic1": "Transformers",
        "topic2": "Natural Language Processing",
    }

    mock_session.run.side_effect = [
        [rec_1hop],  # 1-hop
        [rec_2hop],  # 2-hop topics
        [],          # cross-paper (empty)
    ]
    mock_driver = MagicMock()
    mock_driver.session.return_value.__enter__.return_value = mock_session

    with patch.object(service, "is_available", return_value=True), \
         patch.object(service, "_get_driver", return_value=mock_driver):

        res = service.get_graph_context(paper_ids=["paper-uuid-1", "paper-uuid-2"], max_relationships=30)

        assert "Self-Attention" in res["entities"]
        assert "Transformers" in res["entities"]
        assert "Natural Language Processing" in res["entities"]
        assert any("USES_METHOD Method 'Self-Attention'" in r for r in res["relationships"])
        assert any("Topic 'Transformers' RELATED_TO Topic 'Natural Language Processing'" in r for r in res["relationships"])


def test_6_neo4j_unavailable_falls_back_to_standard_rag():
    """6. Neo4j offline/unavailable -> graceful fallback to standard vector RAG."""
    user, token, project, paper = create_user_and_paper("Fallback Resilience Paper")
    headers = {"Authorization": f"Bearer {token}"}

    mock_llm = CapturingMockLLMProvider("Fallback grounded vector answer [1].")
    mock_chunks = mock_vector_retrieval(paper.id)

    with patch("app.services.llm.service.llm_service._provider", mock_llm), \
         patch("app.services.embedding.embedding_service.embed_query", return_value=[0.1] * 384), \
         patch("app.services.qdrant_service.qdrant_service.search", return_value=mock_chunks), \
         patch.object(neo4j_service, "is_available", return_value=False):

        res = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={
                "question": "What is the result?",
                "scope": "paper",
                "paper_id": str(paper.id),
                "mode": "graph",
            },
        )

        assert res.status_code == 200
        data = res.json()
        assert data["retrieval_mode"] == "graph"
        assert data["graph_fallback"] is True
        assert data["graph_context_used"] is False
        assert "unavailable" in data["graph_fallback_reason"].lower()
        assert len(data["sources"]) == 1
        assert "[1]" in data["answer"]


def test_7_empty_or_malformed_graph_result():
    """7. Empty/malformed graph context gracefully handled without crashing."""
    user, token, project, paper = create_user_and_paper("Empty Graph Paper")
    headers = {"Authorization": f"Bearer {token}"}

    mock_llm = CapturingMockLLMProvider("Answer from vector evidence only [1].")
    mock_chunks = mock_vector_retrieval(paper.id)

    with patch("app.services.llm.service.llm_service._provider", mock_llm), \
         patch("app.services.embedding.embedding_service.embed_query", return_value=[0.1] * 384), \
         patch("app.services.qdrant_service.qdrant_service.search", return_value=mock_chunks), \
         patch.object(neo4j_service, "is_available", return_value=True), \
         patch.object(neo4j_service, "get_graph_context", return_value={"entities": [], "relationships": [], "context_text": ""}):

        res = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={
                "question": "What is the finding?",
                "scope": "paper",
                "paper_id": str(paper.id),
                "mode": "graph",
            },
        )

        assert res.status_code == 200
        data = res.json()
        assert data["retrieval_mode"] == "graph"
        assert data["graph_context_used"] is False
        assert data["graph_entities"] == []
        assert data["graph_relationships"] == []
        assert len(data["sources"]) == 1


def test_8_existing_standard_rag_mode_remains_functional():
    """8. Standard RAG mode works as before without Neo4j invocation."""
    user, token, project, paper = create_user_and_paper("Standard RAG Paper")
    headers = {"Authorization": f"Bearer {token}"}

    mock_llm = CapturingMockLLMProvider("Standard RAG response [1].")
    mock_chunks = mock_vector_retrieval(paper.id)

    with patch("app.services.llm.service.llm_service._provider", mock_llm), \
         patch("app.services.embedding.embedding_service.embed_query", return_value=[0.1] * 384), \
         patch("app.services.qdrant_service.qdrant_service.search", return_value=mock_chunks), \
         patch.object(neo4j_service, "get_graph_context") as mock_get_graph:

        # Mode explicit 'standard'
        res_standard = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={
                "question": "Standard query",
                "scope": "paper",
                "paper_id": str(paper.id),
                "mode": "standard",
            },
        )
        assert res_standard.status_code == 200
        assert res_standard.json()["retrieval_mode"] == "standard"
        assert res_standard.json()["graph_context_used"] is False

        # Mode omitted (defaults to standard)
        res_default = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={
                "question": "Default query",
                "scope": "paper",
                "paper_id": str(paper.id),
            },
        )
        assert res_default.status_code == 200
        assert res_default.json()["retrieval_mode"] == "standard"
        mock_get_graph.assert_not_called()


def test_9_graphrag_api_response_metadata():
    """9. API response contains all expected GraphRAG metadata fields."""
    user, token, project, paper = create_user_and_paper("Metadata Paper")
    headers = {"Authorization": f"Bearer {token}"}

    mock_llm = CapturingMockLLMProvider("Answer with citations [1].")
    mock_chunks = mock_vector_retrieval(paper.id)

    mock_graph_ctx = {
        "entities": ["Topic1"],
        "relationships": [f"Paper '{paper.title}' DISCUSSES Topic 'Topic1'"],
        "context_text": f"- Paper '{paper.title}' DISCUSSES Topic 'Topic1'",
    }

    with patch("app.services.llm.service.llm_service._provider", mock_llm), \
         patch("app.services.embedding.embedding_service.embed_query", return_value=[0.1] * 384), \
         patch("app.services.qdrant_service.qdrant_service.search", return_value=mock_chunks), \
         patch.object(neo4j_service, "is_available", return_value=True), \
         patch.object(neo4j_service, "get_graph_context", return_value=mock_graph_ctx):

        res = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={
                "question": "Metadata test",
                "scope": "paper",
                "paper_id": str(paper.id),
                "mode": "graph",
            },
        )
        assert res.status_code == 200
        data = res.json()

        expected_fields = [
            "question",
            "answer",
            "scope",
            "sources",
            "total_sources",
            "insufficient_evidence",
            "retrieval_mode",
            "graph_context_used",
            "graph_entities",
            "graph_relationships",
            "graph_fallback",
            "graph_fallback_reason",
        ]
        for field in expected_fields:
            assert field in data, f"Missing expected field: {field}"
        assert data["retrieval_mode"] == "graph"
        assert data["graph_context_used"] is True
        assert data["graph_fallback"] is False
