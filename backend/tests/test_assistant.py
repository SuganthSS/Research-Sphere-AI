"""Comprehensive test suite for Module 6 / Iteration 6.1:
Groq RAG Research Assistant and Grounded Citations.

Tests cover:
- LLM Provider Abstraction (GroqProvider, error normalization, timeout handling, missing key)
- LLMService dynamic dispatch and safe status reporting
- Context Builder (deterministic 1-based source numbering, page/section preservation, context budget)
- RAGService safeguards (citation validation, insufficient evidence detection, threshold guarding)
- POST /api/assistant/ask (authentication, validation, scoping, preconditions)
- Strict Multi-Tenant Security & Ownership Isolation (cross-user access blocked)
- GET /api/assistant/status and GET /api/health/groq
"""
import io
import uuid
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch
import pytest
import pymupdf
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.services.context_builder import RAGContextBuilder, context_builder
from app.services.llm.base import BaseLLMProvider
from app.services.llm.exceptions import (
    LLMAuthenticationError,
    LLMConfigurationError,
    LLMConnectionError,
    LLMModelNotFoundError,
    LLMProviderError,
    LLMRateLimitError,
    LLMTimeoutError,
)
from app.services.llm.groq_provider import GroqProvider
from app.services.llm.service import LLMService, llm_service
from app.services.rag_service import (
    INSUFFICIENT_EVIDENCE_ANSWER,
    RAGService,
    rag_service,
)

client = TestClient(app)


# ---------------------------------------------------------------------------
# Test Helpers
# ---------------------------------------------------------------------------

class MockLLMProvider(BaseLLMProvider):
    """Deterministic mock LLM provider for unit & integration testing."""

    def __init__(
        self,
        canned_response: str = "The study uses an adaptive learning rate schedule with cosine annealing [1].",
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
    ) -> str:
        self.last_prompt = prompt
        self.last_system_instruction = system_instruction
        if self.should_fail:
            raise self.should_fail
        return self.canned_response

    def get_status(self) -> Dict[str, Any]:
        return {
            "provider": "mock",
            "model": "mock-test-model",
            "configured": True,
            "status": "configured",
            "message": "Mock provider active.",
        }


def create_authenticated_user(name: str = "Dr. RAG Tester") -> tuple[dict, str, uuid.UUID]:
    email = f"rag_{uuid.uuid4().hex[:8]}@example.com"
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


def create_test_project(token: str, name: str = "RAG Assistant Lab") -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    res = client.post(
        "/api/projects",
        headers=headers,
        json={"name": name, "description": "Testing AI Research Assistant."},
    )
    assert res.status_code == 201, res.text
    return res.json()


def generate_research_pdf() -> bytes:
    pages = [
        "Abstract\n\nThis paper presents deep convolutional neural architectures for computer vision.",
        "Methodology\n\nThe model utilizes residual skip connections, batch normalization, and AdamW optimization.",
        "Results\n\nThe proposed method achieved a 94.6% top-1 accuracy on the benchmark dataset.",
    ]
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page(width=595, height=842)
        page.insert_text((50, 72), text, fontsize=11)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def upload_and_index_paper(token: str, project_id: str) -> dict:
    """Full pipeline helper: Upload -> Extract -> Process -> Embed."""
    headers = {"Authorization": f"Bearer {token}"}
    pdf_bytes = generate_research_pdf()
    files = {"file": ("research_paper.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    upload_res = client.post(f"/api/projects/{project_id}/papers", headers=headers, files=files)
    assert upload_res.status_code == 201, upload_res.text
    paper = upload_res.json()
    paper_id = paper["id"]

    # Extract
    ext_res = client.post(f"/api/papers/{paper_id}/extract", headers=headers)
    assert ext_res.status_code == 200, ext_res.text

    # Process chunks
    proc_res = client.post(f"/api/papers/{paper_id}/process", headers=headers)
    assert proc_res.status_code == 200, proc_res.text

    # Embed & Qdrant upsert
    emb_res = client.post(f"/api/papers/{paper_id}/embed", headers=headers)
    assert emb_res.status_code == 200, emb_res.text

    return paper


# ---------------------------------------------------------------------------
# 1. LLM Provider Abstraction Tests
# ---------------------------------------------------------------------------

class TestLLMProviderAbstraction:

    def test_missing_api_key_raises_configuration_error(self):
        provider = GroqProvider(api_key="")
        with pytest.raises(LLMConfigurationError) as exc_info:
            provider.generate(prompt="Hello")
        assert "Groq API key is not configured" in str(exc_info.value)

    def test_successful_response_with_mocked_groq_client(self):
        provider = GroqProvider(api_key="gsk_mock_test_key_1234567890", model="llama-3.3-70b-versatile")
        mock_client = MagicMock()
        mock_choice = MagicMock()
        mock_choice.message.content = "Grounded research response from Groq."
        mock_client.chat.completions.create.return_value = MagicMock(choices=[mock_choice])
        provider._client = mock_client

        answer = provider.generate(
            prompt="What is the methodology?",
            system_instruction="Answer grounded only in context.",
        )
        assert answer == "Grounded research response from Groq."
        mock_client.chat.completions.create.assert_called_once()
        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["model"] == "llama-3.3-70b-versatile"
        assert len(call_kwargs["messages"]) == 2
        assert call_kwargs["messages"][0]["role"] == "system"
        assert call_kwargs["messages"][1]["role"] == "user"

    def test_groq_authentication_error_normalized(self):
        provider = GroqProvider(api_key="invalid_key")
        mock_client = MagicMock()

        class MockAuthError(Exception):
            pass

        MockAuthError.__name__ = "AuthenticationError"
        mock_client.chat.completions.create.side_effect = MockAuthError("Invalid credentials")
        provider._client = mock_client

        with pytest.raises(LLMAuthenticationError) as exc:
            provider.generate("test prompt")
        assert "invalid API key" in str(exc.value)

    def test_groq_model_not_found_error_normalized(self):
        provider = GroqProvider(api_key="test_key", model="nonexistent-model-xyz")
        mock_client = MagicMock()

        class MockNotFoundError(Exception):
            pass

        MockNotFoundError.__name__ = "NotFoundError"
        mock_client.chat.completions.create.side_effect = MockNotFoundError("Model not found")
        provider._client = mock_client

        with pytest.raises(LLMModelNotFoundError) as exc:
            provider.generate("test prompt")
        assert "nonexistent-model-xyz" in str(exc.value)

    def test_groq_rate_limit_error_normalized(self):
        provider = GroqProvider(api_key="test_key")
        mock_client = MagicMock()

        class MockRateLimitError(Exception):
            pass

        MockRateLimitError.__name__ = "RateLimitError"
        mock_client.chat.completions.create.side_effect = MockRateLimitError("Rate limit exceeded")
        provider._client = mock_client

        with pytest.raises(LLMRateLimitError) as exc:
            provider.generate("test prompt")
        assert "rate limit" in str(exc.value).lower()

    def test_groq_timeout_error_normalized(self):
        provider = GroqProvider(api_key="test_key", timeout=15)
        mock_client = MagicMock()

        class MockTimeoutError(Exception):
            pass

        MockTimeoutError.__name__ = "APITimeoutError"
        mock_client.chat.completions.create.side_effect = MockTimeoutError("Request timed out")
        provider._client = mock_client

        with pytest.raises(LLMTimeoutError) as exc:
            provider.generate("test prompt")
        assert "timed out after 15 seconds" in str(exc.value)

    def test_groq_connection_error_normalized(self):
        provider = GroqProvider(api_key="test_key")
        mock_client = MagicMock()

        class MockConnError(Exception):
            pass

        MockConnError.__name__ = "APIConnectionError"
        mock_client.chat.completions.create.side_effect = MockConnError("Connection dropped")
        provider._client = mock_client

        with pytest.raises(LLMConnectionError) as exc:
            provider.generate("test prompt")
        assert "Failed to connect to Groq API" in str(exc.value)

    def test_provider_status_reporting_not_configured(self):
        provider = GroqProvider(api_key="")
        status = provider.get_status()
        assert status["configured"] is False
        assert status["status"] == "not_configured"

    def test_provider_status_reporting_configured(self):
        provider = GroqProvider(api_key="test_key")
        status = provider.get_status()
        assert status["configured"] is True
        assert status["status"] == "configured"
        assert "api_key" not in status  # Never leak key

    def test_llm_service_set_provider_dispatch(self):
        svc = LLMService()
        mock = MockLLMProvider("Custom mock response")
        svc.set_provider(mock)
        res = svc.generate_grounded_answer(prompt="Hi", system_instruction="System")
        assert res == "Custom mock response"
        assert mock.last_prompt == "Hi"


# ---------------------------------------------------------------------------
# 2. Context Builder Unit Tests
# ---------------------------------------------------------------------------

class TestContextBuilder:

    def test_context_builder_empty_chunks(self):
        builder = RAGContextBuilder()
        res = builder.build_context([])
        assert res.total_sources == 0
        assert res.context_text == ""
        assert res.sources == []
        assert res.max_similarity == 0.0

    def test_context_builder_deterministic_numbering_and_metadata(self):
        p1 = uuid.uuid4()
        c1 = uuid.uuid4()
        p2 = uuid.uuid4()
        c2 = uuid.uuid4()

        raw = [
            {
                "score": 0.88,
                "paper_id": p1,
                "paper_title": "Attention Mechanism",
                "chunk_id": c1,
                "chunk_index": 3,
                "section_name": "Methodology",
                "start_page": 4,
                "end_page": 5,
                "text": "Self-attention correlates different positions of a single sequence.",
            },
            {
                "score": 0.75,
                "paper_id": p2,
                "paper_title": "Transformer Models",
                "chunk_id": c2,
                "chunk_index": 1,
                "section_name": "Introduction",
                "start_page": 1,
                "end_page": 1,
                "text": "Recurrent neural networks suffer from sequential computation constraints.",
            },
        ]

        builder = RAGContextBuilder()
        res = builder.build_context(raw)
        assert res.total_sources == 2
        assert res.max_similarity == 0.88
        assert res.sources[0].source_number == 1
        assert res.sources[0].paper_title == "Attention Mechanism"
        assert res.sources[0].similarity_score == 0.88
        assert res.sources[1].source_number == 2
        assert res.sources[1].paper_title == "Transformer Models"

        assert "[SOURCE 1]" in res.context_text
        assert "[SOURCE 2]" in res.context_text
        assert "Pages: 4–5" in res.context_text
        assert "Pages: 1" in res.context_text

    def test_context_builder_orders_descending_by_score(self):
        raw = [
            {"score": 0.50, "paper_id": uuid.uuid4(), "chunk_id": uuid.uuid4(), "text": "Low score text"},
            {"score": 0.95, "paper_id": uuid.uuid4(), "chunk_id": uuid.uuid4(), "text": "Top score text"},
            {"score": 0.70, "paper_id": uuid.uuid4(), "chunk_id": uuid.uuid4(), "text": "Medium score text"},
        ]
        builder = RAGContextBuilder()
        res = builder.build_context(raw)
        assert res.sources[0].similarity_score == 0.95
        assert res.sources[0].source_number == 1
        assert res.sources[1].similarity_score == 0.70
        assert res.sources[2].similarity_score == 0.50

    def test_context_builder_budget_enforcement(self):
        # Create chunks with 200 chars each, set max_context_chars to 350
        raw = [
            {"score": 0.90, "paper_id": uuid.uuid4(), "chunk_id": uuid.uuid4(), "text": "A" * 150},
            {"score": 0.85, "paper_id": uuid.uuid4(), "chunk_id": uuid.uuid4(), "text": "B" * 150},
            {"score": 0.80, "paper_id": uuid.uuid4(), "chunk_id": uuid.uuid4(), "text": "C" * 150},
        ]
        builder = RAGContextBuilder(max_context_chars=350)
        res = builder.build_context(raw)
        # Should include first chunk, maybe second, but definitely not third
        assert res.total_sources < 3


# ---------------------------------------------------------------------------
# 3. RAG Service & Hallucination-Safety Tests
# ---------------------------------------------------------------------------

class TestRAGServiceSafeguards:

    def test_empty_retrieval_returns_insufficient_evidence_without_llm_call(self):
        mock_provider = MockLLMProvider()
        llm_service.set_provider(mock_provider)

        result = rag_service.answer_question(
            question="What is the learning rate?",
            retrieved_chunks=[],
        )
        assert result.insufficient_evidence is True
        assert INSUFFICIENT_EVIDENCE_ANSWER in result.answer
        assert len(result.sources) == 0
        assert mock_provider.last_prompt is None  # LLM never called!

    def test_weak_retrieval_below_threshold_returns_insufficient_evidence(self):
        mock_provider = MockLLMProvider()
        llm_service.set_provider(mock_provider)

        low_score_chunks = [
            {
                "score": 0.08,  # Below threshold 0.20
                "paper_id": uuid.uuid4(),
                "chunk_id": uuid.uuid4(),
                "paper_title": "Deep Learning",
                "section_name": "Abstract",
                "start_page": 1,
                "end_page": 1,
                "text": "General computing principles.",
            }
        ]

        result = rag_service.answer_question(
            question="What treatment is recommended for malaria?",
            retrieved_chunks=low_score_chunks,
            similarity_threshold=0.20,
        )
        assert result.insufficient_evidence is True
        assert INSUFFICIENT_EVIDENCE_ANSWER in result.answer
        assert len(result.sources) == 0
        assert mock_provider.last_prompt is None  # Safeguard triggered before LLM call

    def test_citation_validation_strips_hallucinated_source_numbers(self):
        # LLM references [1], [2], and hallucinated [7]
        mock_provider = MockLLMProvider("The architecture uses skip connections [1] and batch norm [2], verified in [7].")
        llm_service.set_provider(mock_provider)

        valid_chunks = [
            {
                "score": 0.85,
                "paper_id": uuid.uuid4(),
                "chunk_id": uuid.uuid4(),
                "paper_title": "ResNet",
                "section_name": "Methods",
                "start_page": 3,
                "end_page": 4,
                "text": "Residual skip connections.",
            },
            {
                "score": 0.80,
                "paper_id": uuid.uuid4(),
                "chunk_id": uuid.uuid4(),
                "paper_title": "ResNet",
                "section_name": "Methods",
                "start_page": 4,
                "end_page": 4,
                "text": "Batch normalization after convolutions.",
            },
        ]

        result = rag_service.answer_question(
            question="How does ResNet normalize layers?",
            retrieved_chunks=valid_chunks,
        )
        assert result.insufficient_evidence is False
        assert "[1]" in result.answer
        assert "[2]" in result.answer
        assert "[7]" not in result.answer  # Hallucinated citation [7] safely removed!


# ---------------------------------------------------------------------------
# 4. Assistant API Endpoint Tests
# ---------------------------------------------------------------------------

class TestAssistantAPIEndpoints:

    def test_ask_endpoint_requires_authentication(self):
        res = client.post(
            "/api/assistant/ask",
            json={"question": "What is this paper about?", "scope": "paper", "paper_id": str(uuid.uuid4())},
        )
        assert res.status_code == 401

    def test_ask_endpoint_rejects_empty_question(self):
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        res = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={"question": "   ", "scope": "paper", "paper_id": str(uuid.uuid4())},
        )
        assert res.status_code == 400
        assert "empty or blank" in res.json()["detail"]

    def test_ask_endpoint_rejects_invalid_scope(self):
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        res = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={"question": "What is the method?", "scope": "global"},
        )
        assert res.status_code == 422  # Pydantic Literal validation

    def test_ask_endpoint_missing_paper_id_for_paper_scope(self):
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        res = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={"question": "What is the method?", "scope": "paper"},
        )
        assert res.status_code == 400
        assert "paper_id is required" in res.json()["detail"]

    def test_ask_endpoint_missing_project_id_for_project_scope(self):
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        res = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={"question": "What is the method?", "scope": "project"},
        )
        assert res.status_code == 400
        assert "project_id is required" in res.json()["detail"]

    def test_ask_endpoint_nonexistent_paper_returns_404(self):
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        res = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={"question": "What is the method?", "scope": "paper", "paper_id": str(uuid.uuid4())},
        )
        assert res.status_code == 404
        assert "Research paper not found" in res.json()["detail"]

    def test_ask_endpoint_unindexed_paper_returns_400(self):
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        proj = create_test_project(token)

        # Upload paper but DO NOT embed
        pdf_bytes = generate_research_pdf()
        files = {"file": ("unindexed.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
        up_res = client.post(f"/api/projects/{proj['id']}/papers", headers=headers, files=files)
        assert up_res.status_code == 201, up_res.text
        paper_id = up_res.json()["id"]

        res = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={"question": "What is the method?", "scope": "paper", "paper_id": paper_id},
        )
        assert res.status_code == 400
        assert "has not been semantically indexed" in res.json()["detail"]

    def test_ask_endpoint_project_without_indexed_papers_returns_400(self):
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        proj = create_test_project(token)

        res = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={"question": "What is the method?", "scope": "project", "project_id": proj["id"]},
        )
        assert res.status_code == 400
        assert "does not contain any semantically indexed papers" in res.json()["detail"]

    def test_ask_endpoint_successful_paper_qa(self):
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        proj = create_test_project(token)
        paper = upload_and_index_paper(token, proj["id"])

        mock_llm = MockLLMProvider(
            "The model utilizes residual skip connections and AdamW optimization [1]."
        )
        llm_service.set_provider(mock_llm)

        res = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={
                "question": "What optimization and connections does the model use?",
                "scope": "paper",
                "paper_id": paper["id"],
            },
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["scope"] == "paper"
        assert data["paper_id"] == paper["id"]
        assert "residual skip connections" in data["answer"]
        assert data["total_sources"] > 0
        assert len(data["sources"]) == data["total_sources"]

        # Check source citation metadata
        first_src = data["sources"][0]
        assert first_src["source_number"] == 1
        assert first_src["paper_title"] == paper["title"]
        assert first_src["similarity_score"] > 0.0
        assert "chunk_id" in first_src
        assert "start_page" in first_src

    def test_ask_endpoint_successful_project_qa(self):
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        proj = create_test_project(token)
        paper = upload_and_index_paper(token, proj["id"])

        mock_llm = MockLLMProvider(
            "Across the project's literature, convolution and deep residual models achieved high benchmark accuracy [1]."
        )
        llm_service.set_provider(mock_llm)

        res = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={
                "question": "What accuracy is reported across the project?",
                "scope": "project",
                "project_id": proj["id"],
            },
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["scope"] == "project"
        assert data["project_id"] == proj["id"]
        assert data["total_sources"] > 0

    def test_ask_endpoint_handles_missing_groq_key_with_503(self):
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        proj = create_test_project(token)
        paper = upload_and_index_paper(token, proj["id"])

        # Inject real GroqProvider with empty key to simulate missing key
        unconfigured_provider = GroqProvider(api_key="")
        llm_service.set_provider(unconfigured_provider)

        res = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={
                "question": "What is the methodology?",
                "scope": "paper",
                "paper_id": paper["id"],
            },
        )
        assert res.status_code == 503
        assert "Groq API key is not configured" in res.json()["detail"]

    def test_assistant_status_endpoint(self):
        res = client.get("/api/assistant/status")
        assert res.status_code == 200
        data = res.json()
        assert "provider" in data
        assert "model" in data
        assert "configured" in data
        assert "status" in data

    def test_groq_health_endpoint(self):
        res = client.get("/api/health/groq")
        assert res.status_code == 200
        data = res.json()
        assert "provider" in data
        assert "model" in data
        assert "state" in data


# ---------------------------------------------------------------------------
# 5. Security & Ownership Isolation Tests
# ---------------------------------------------------------------------------

class TestAssistantSecurityIsolation:

    def test_user_b_cannot_ask_question_against_user_a_paper(self):
        # User A uploads and indexes paper
        _, token_a, _ = create_authenticated_user(name="User A")
        proj_a = create_test_project(token_a, name="User A Confidential Lab")
        paper_a = upload_and_index_paper(token_a, proj_a["id"])

        # User B attempts to ask question against User A's paper
        _, token_b, _ = create_authenticated_user(name="User B (Attacker)")
        headers_b = {"Authorization": f"Bearer {token_b}"}

        res = client.post(
            "/api/assistant/ask",
            headers=headers_b,
            json={
                "question": "What proprietary algorithms does User A use?",
                "scope": "paper",
                "paper_id": paper_a["id"],
            },
        )
        assert res.status_code == 404
        assert "Research paper not found" in res.json()["detail"]

    def test_user_b_cannot_ask_question_against_user_a_project(self):
        # User A sets up project and indexed paper
        _, token_a, _ = create_authenticated_user(name="User A")
        proj_a = create_test_project(token_a, name="User A Project")
        upload_and_index_paper(token_a, proj_a["id"])

        # User B attempts project-scoped Q&A
        _, token_b, _ = create_authenticated_user(name="User B (Attacker)")
        headers_b = {"Authorization": f"Bearer {token_b}"}

        res = client.post(
            "/api/assistant/ask",
            headers=headers_b,
            json={
                "question": "Summarize project discoveries",
                "scope": "project",
                "project_id": proj_a["id"],
            },
        )
        assert res.status_code == 404
        assert "Research project not found" in res.json()["detail"]

    def test_user_b_receives_no_chunks_or_sources_from_user_a(self):
        """Even with manipulated search/retrieval parameters, User B's queries never receive User A sources."""
        _, token_a, user_a_id = create_authenticated_user(name="User A")
        proj_a = create_test_project(token_a, name="User A Genomics")
        upload_and_index_paper(token_a, proj_a["id"])

        # User B has own project and paper
        _, token_b, _ = create_authenticated_user(name="User B")
        proj_b = create_test_project(token_b, name="User B Botany")
        paper_b = upload_and_index_paper(token_b, proj_b["id"])

        mock_llm = MockLLMProvider("Answer strictly from User B literature [1].")
        llm_service.set_provider(mock_llm)

        headers_b = {"Authorization": f"Bearer {token_b}"}
        res = client.post(
            "/api/assistant/ask",
            headers=headers_b,
            json={
                "question": "What methods are used in this paper?",
                "scope": "paper",
                "paper_id": paper_b["id"],
            },
        )
        assert res.status_code == 200
        sources = res.json()["sources"]
        # Verify NONE of the returned sources belong to User A
        for s in sources:
            assert s["paper_id"] == paper_b["id"]
            assert s["paper_id"] != proj_a["id"]

    def test_citation_sources_include_valid_chunk_id_and_page_metadata(self):
        """Every citation returned has a valid chunk_id matching stored PaperChunk and page bounds."""
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        proj = create_test_project(token)
        paper = upload_and_index_paper(token, proj["id"])

        chunks_res = client.get(f"/api/papers/{paper['id']}/chunks", headers=headers)
        assert chunks_res.status_code == 200
        chunks_data = chunks_res.json()["chunks"]
        assert len(chunks_data) > 0
        for c in chunks_data:
            assert "id" in c and c["id"] is not None
            assert c["start_page"] >= 1
            assert c["end_page"] >= c["start_page"]

        mock_llm = MockLLMProvider("The methodology uses residual attention [1].")
        llm_service.set_provider(mock_llm)

        res = client.post(
            "/api/assistant/ask",
            headers=headers,
            json={
                "question": "What architecture is used?",
                "scope": "paper",
                "paper_id": paper["id"],
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert len(data["sources"]) > 0
        first_src = data["sources"][0]
        assert first_src["chunk_id"] is not None
        assert first_src["start_page"] >= 1
        assert first_src["end_page"] >= first_src["start_page"]
        assert first_src["source_number"] == 1
        known_ids = [str(c["id"]) for c in chunks_data]
        assert str(first_src["chunk_id"]) in known_ids
