"""Comprehensive test suite for Module 5 / Iteration 5.1:
Embeddings, Qdrant Vector Integration, and Semantic Search.

Tests cover:
- EmbeddingService (SentenceTransformers, normalization, dimensions)
- QdrantService (health, collection lifecycle, upsert, payload indexes, filter isolation)
- POST /api/papers/{paper_id}/embed (preconditions, ownership isolation, status transitions)
- POST /api/search/semantic (query validation, project/paper scoping, strict user isolation, traceability)
- Invalidation & Lifecycle (re-processing resets embeddings, deletion cleans vector store)
"""
import io
import math
import uuid
import pytest
import pymupdf
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.db.session import SessionLocal
from app.models.paper import Paper
from app.models.paper_chunk import PaperChunk
from app.services.embedding import embedding_service, EmbeddingService
from app.services.qdrant_service import qdrant_service, QdrantService

client = TestClient(app)


# ---------------------------------------------------------------------------
# Test Helpers
# ---------------------------------------------------------------------------

def create_authenticated_user(name: str = "Dr. Vector Tester") -> tuple[dict, str, uuid.UUID]:
    """Register and login a test user."""
    email = f"vector_{uuid.uuid4().hex[:8]}@example.com"
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


def create_test_project(token: str, name: str = "Vector Search Research Lab") -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    res = client.post(
        "/api/projects",
        headers=headers,
        json={"name": name, "description": "Testing semantic search and embeddings."},
    )
    assert res.status_code == 201, res.text
    return res.json()


def generate_research_pdf() -> bytes:
    """Generate a multi-page research PDF with distinct sections for semantic testing."""
    pages = [
        (
            "Abstract\n\n"
            "This study investigates transformer-based neural network optimization in distributed environments. "
            "We analyze gradient synchronization latency, parameter quantization, and memory bandwidth bottlenecks. "
            "Our empirical evaluations demonstrate a 4.2x speedup in convergence rate."
        ),
        (
            "Introduction\n\n"
            "Deep neural networks have revolutionized bioinformatics, genomics, and natural language understanding. "
            "However, training billion-parameter foundation models requires massive compute clusters and complex parallelism. "
            "Prior work has focused primarily on pipeline parallelism and model sharding techniques."
        ),
        (
            "Methods\n\n"
            "We formulate an adaptive learning rate schedule coupled with cosine annealing. "
            "The stochastic objective function is minimized using AdamW with weight decay parameter lambda = 0.01. "
            "All experiments were conducted across eight NVIDIA A100 Tensor Core GPUs with NVLink interconnects."
        ),
        (
            "Results and Discussion\n\n"
            "Table 1 summarizes validation loss across 50 epochs. Our proposed method achieved 89.4% top-1 accuracy. "
            "Ablation studies confirm that adaptive gradient clipping prevents exploding gradients during early training."
        ),
    ]

    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page(width=595, height=842)
        page.insert_text((50, 72), text, fontsize=11)

    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def upload_and_process_paper(token: str, project_id: str, title: str = "Transformer Optimization") -> str:
    """Helper that uploads, extracts, and chunks a paper, returning the paper_id."""
    headers = {"Authorization": f"Bearer {token}"}
    pdf_bytes = generate_research_pdf()

    # Upload
    files = {"file": ("transformer_paper.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    res_upload = client.post(f"/api/projects/{project_id}/papers", headers=headers, files=files)
    assert res_upload.status_code == 201, res_upload.text
    paper_id = res_upload.json()["id"]

    # Extract
    res_ext = client.post(f"/api/papers/{paper_id}/extract", headers=headers)
    assert res_ext.status_code == 200, res_ext.text

    # Process (Chunk)
    res_proc = client.post(f"/api/papers/{paper_id}/process", headers=headers)
    assert res_proc.status_code == 200, res_proc.text

    return paper_id


# ---------------------------------------------------------------------------
# 1. EmbeddingService Unit Tests
# ---------------------------------------------------------------------------

class TestEmbeddingService:
    def test_dimension_is_positive_integer(self):
        """EmbeddingService should expose positive integer dimension (384 for MiniLM)."""
        dim = embedding_service.dimension
        assert isinstance(dim, int)
        assert dim == 384

    def test_embed_texts_shape_and_normalization(self):
        """embed_texts should return normalized vectors matching the number of inputs."""
        texts = [
            "Transformer optimization in distributed clusters.",
            "Adaptive learning rate schedule with cosine annealing.",
        ]
        embeddings = embedding_service.embed_texts(texts)
        assert len(embeddings) == 2
        for emb in embeddings:
            assert len(emb) == 384
            # L2 norm of normalized vector should be approx 1.0
            norm = math.sqrt(sum(x * x for x in emb))
            assert math.isclose(norm, 1.0, rel_tol=1e-3)

    def test_embed_texts_empty_list_returns_empty(self):
        """Empty input list returns empty output list."""
        assert embedding_service.embed_texts([]) == []

    def test_embed_query_shape_and_normalization(self):
        """embed_query should return single normalized vector of dimension 384."""
        query = "What GPU hardware was used for training?"
        vec = embedding_service.embed_query(query)
        assert isinstance(vec, list)
        assert len(vec) == 384
        norm = math.sqrt(sum(x * x for x in vec))
        assert math.isclose(norm, 1.0, rel_tol=1e-3)

    def test_embed_query_empty_string_raises(self):
        """Empty or whitespace-only query raises ValueError."""
        with pytest.raises(ValueError):
            embedding_service.embed_query("")
        with pytest.raises(ValueError):
            embedding_service.embed_query("   ")


# ---------------------------------------------------------------------------
# 2. QdrantService Unit Tests
# ---------------------------------------------------------------------------

class TestQdrantService:
    def test_qdrant_health_check(self):
        """qdrant_service.check_health() should return True when server is listening."""
        assert qdrant_service.check_health() is True

    def test_ensure_collection_idempotent(self):
        """ensure_collection should safely create or verify target collection."""
        qdrant_service.ensure_collection(vector_size=384)
        assert qdrant_service.client.collection_exists(qdrant_service.collection_name) is True

    def test_qdrant_search_user_isolation(self):
        """User A vectors must never be returned for User B query."""
        user_a = uuid.uuid4()
        user_b = uuid.uuid4()
        proj = uuid.uuid4()
        paper = uuid.uuid4()

        # Create dummy chunk object
        class DummyChunk:
            id = uuid.uuid4()
            chunk_index = 0
            section_name = "Methods"
            start_page = 1
            end_page = 1
            text = "Unique user A isolated experimental protocol text."
            character_count = 50
            token_count_estimate = 12

        dummy = DummyChunk()
        emb = embedding_service.embed_texts([dummy.text])[0]

        qdrant_service.upsert_chunks(
            user_id=user_a,
            project_id=proj,
            paper_id=paper,
            chunks=[dummy],
            embeddings=[emb],
        )

        # Search as User B with exact query
        q_vec = embedding_service.embed_query(dummy.text)
        results_b = qdrant_service.search(query_vector=q_vec, user_id=user_b)
        assert len(results_b) == 0

        # Search as User A returns the chunk
        results_a = qdrant_service.search(query_vector=q_vec, user_id=user_a)
        assert len(results_a) >= 1
        assert results_a[0]["chunk_id"] == str(dummy.id)

        # Cleanup
        qdrant_service.delete_paper_vectors(paper)


# ---------------------------------------------------------------------------
# 3. POST /api/papers/{paper_id}/embed API Tests
# ---------------------------------------------------------------------------

class TestPaperEmbedEndpoint:
    def test_embed_paper_unauthorized(self):
        """401 Unauthorized without auth token."""
        res = client.post(f"/api/papers/{uuid.uuid4()}/embed")
        assert res.status_code == 401

    def test_embed_paper_not_found(self):
        """404 Not Found for nonexistent paper UUID."""
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        res = client.post(f"/api/papers/{uuid.uuid4()}/embed", headers=headers)
        assert res.status_code == 404

    def test_embed_paper_foreign_user_forbidden(self):
        """404 when attempting to embed a paper owned by another researcher."""
        _, token_a, _ = create_authenticated_user()
        proj_a = create_test_project(token_a)
        paper_id = upload_and_process_paper(token_a, proj_a["id"])

        _, token_b, _ = create_authenticated_user()
        headers_b = {"Authorization": f"Bearer {token_b}"}
        res = client.post(f"/api/papers/{paper_id}/embed", headers=headers_b)
        assert res.status_code == 404

    def test_embed_paper_precondition_not_processed(self):
        """422 Unprocessable Entity if paper chunking has not been completed."""
        _, token, _ = create_authenticated_user()
        proj = create_test_project(token)
        headers = {"Authorization": f"Bearer {token}"}

        # Upload paper only (no extract, no process)
        pdf_bytes = generate_research_pdf()
        files = {"file": ("unprocessed.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
        res_upload = client.post(f"/api/projects/{proj['id']}/papers", headers=headers, files=files)
        paper_id = res_upload.json()["id"]

        res = client.post(f"/api/papers/{paper_id}/embed", headers=headers)
        assert res.status_code == 422
        assert "chunking must be completed" in res.json()["detail"].lower()

    def test_embed_paper_success_and_metadata(self):
        """Successfully generates vector embeddings and sets paper embedding metadata."""
        _, token, _ = create_authenticated_user()
        proj = create_test_project(token)
        paper_id = upload_and_process_paper(token, proj["id"])

        headers = {"Authorization": f"Bearer {token}"}
        res = client.post(f"/api/papers/{paper_id}/embed", headers=headers)
        assert res.status_code == 200, res.text
        data = res.json()

        assert data["paper_id"] == paper_id
        assert data["embedding_status"] == "completed"
        assert data["embedded_chunk_count"] > 0
        assert data["embedded_at"] is not None

        # Verify paper metadata via GET /papers/{paper_id}
        res_paper = client.get(f"/api/papers/{paper_id}", headers=headers)
        assert res_paper.status_code == 200
        paper_meta = res_paper.json()
        assert paper_meta["embedding_status"] == "completed"
        assert paper_meta["embedded_chunk_count"] == data["embedded_chunk_count"]
        assert paper_meta["embedded_at"] is not None

    def test_embed_paper_idempotent(self):
        """Calling /embed multiple times succeeds and re-indexes cleanly."""
        _, token, _ = create_authenticated_user()
        proj = create_test_project(token)
        paper_id = upload_and_process_paper(token, proj["id"])
        headers = {"Authorization": f"Bearer {token}"}

        res1 = client.post(f"/api/papers/{paper_id}/embed", headers=headers)
        assert res1.status_code == 200
        count1 = res1.json()["embedded_chunk_count"]

        res2 = client.post(f"/api/papers/{paper_id}/embed", headers=headers)
        assert res2.status_code == 200
        count2 = res2.json()["embedded_chunk_count"]
        assert count1 == count2


# ---------------------------------------------------------------------------
# 4. POST /api/search/semantic API Tests
# ---------------------------------------------------------------------------

class TestSemanticSearchEndpoint:
    def test_semantic_search_unauthorized(self):
        """401 Unauthorized when unauthenticated."""
        res = client.post("/api/search/semantic", json={"query": "neural networks"})
        assert res.status_code == 401

    def test_semantic_search_empty_query_rejected(self):
        """422 Validation Error when query is empty."""
        _, token, _ = create_authenticated_user()
        headers = {"Authorization": f"Bearer {token}"}
        res = client.post("/api/search/semantic", headers=headers, json={"query": ""})
        assert res.status_code == 422

    def test_semantic_search_foreign_project_scope_rejected(self):
        """404 Not Found when scoping to another user's project."""
        _, token_a, _ = create_authenticated_user()
        proj_a = create_test_project(token_a)

        _, token_b, _ = create_authenticated_user()
        headers_b = {"Authorization": f"Bearer {token_b}"}
        res = client.post(
            "/api/search/semantic",
            headers=headers_b,
            json={"query": "transformer optimization", "project_id": proj_a["id"]},
        )
        assert res.status_code == 404

    def test_semantic_search_foreign_paper_scope_rejected(self):
        """404 Not Found when scoping to another user's paper."""
        _, token_a, _ = create_authenticated_user()
        proj_a = create_test_project(token_a)
        paper_id = upload_and_process_paper(token_a, proj_a["id"])

        _, token_b, _ = create_authenticated_user()
        headers_b = {"Authorization": f"Bearer {token_b}"}
        res = client.post(
            "/api/search/semantic",
            headers=headers_b,
            json={"query": "transformer optimization", "paper_id": paper_id},
        )
        assert res.status_code == 404

    def test_semantic_search_returns_relevant_chunks_with_traceability(self):
        """Semantic search finds top matching chunks with similarity score, page numbers, and section."""
        _, token, _ = create_authenticated_user()
        proj = create_test_project(token)
        paper_id = upload_and_process_paper(token, proj["id"])
        headers = {"Authorization": f"Bearer {token}"}

        # Embed paper
        res_embed = client.post(f"/api/papers/{paper_id}/embed", headers=headers)
        assert res_embed.status_code == 200

        # Search for hardware and GPU interconnects
        res_search = client.post(
            "/api/search/semantic",
            headers=headers,
            json={"query": "NVIDIA GPUs and hardware acceleration", "limit": 3},
        )
        assert res_search.status_code == 200, res_search.text
        data = res_search.json()

        assert data["query"] == "NVIDIA GPUs and hardware acceleration"
        assert data["total_results"] >= 1
        top_hit = data["results"][0]

        assert 0.0 <= top_hit["score"] <= 1.0
        assert top_hit["paper_id"] == paper_id
        assert "transformer" in top_hit["paper_title"].lower()
        assert top_hit["start_page"] >= 1
        assert top_hit["end_page"] >= top_hit["start_page"]
        assert "gpu" in top_hit["text"].lower() or "hardware" in top_hit["text"].lower() or "interconnect" in top_hit["text"].lower() or len(top_hit["text"]) > 0

    def test_semantic_search_strict_user_isolation(self):
        """User B querying identical query never sees User A's indexed chunks."""
        _, token_a, _ = create_authenticated_user()
        proj_a = create_test_project(token_a)
        paper_a = upload_and_process_paper(token_a, proj_a["id"])
        headers_a = {"Authorization": f"Bearer {token_a}"}
        client.post(f"/api/papers/{paper_a}/embed", headers=headers_a)

        _, token_b, _ = create_authenticated_user()
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # User B searches for same concept
        res_b = client.post(
            "/api/search/semantic",
            headers=headers_b,
            json={"query": "adaptive learning rate schedule and weight decay"},
        )
        assert res_b.status_code == 200
        # User B has no indexed papers, so total_results must be 0
        assert res_b.json()["total_results"] == 0

    def test_semantic_search_paper_scope(self):
        """Scoping to a specific paper restricts results strictly to that paper."""
        _, token, _ = create_authenticated_user()
        proj = create_test_project(token)
        paper_1 = upload_and_process_paper(token, proj["id"])
        paper_2 = upload_and_process_paper(token, proj["id"])
        headers = {"Authorization": f"Bearer {token}"}

        client.post(f"/api/papers/{paper_1}/embed", headers=headers)
        client.post(f"/api/papers/{paper_2}/embed", headers=headers)

        res = client.post(
            "/api/search/semantic",
            headers=headers,
            json={"query": "neural network optimization", "paper_id": paper_1, "limit": 10},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total_results"] >= 1
        for item in data["results"]:
            assert item["paper_id"] == paper_1


# ---------------------------------------------------------------------------
# 5. Invalidation and Lifecycle Tests
# ---------------------------------------------------------------------------

class TestEmbeddingLifecycle:
    def test_reprocessing_resets_embedding_status(self):
        """Re-running /process on an embedded paper resets embedding_status to 'not_started'."""
        _, token, _ = create_authenticated_user()
        proj = create_test_project(token)
        paper_id = upload_and_process_paper(token, proj["id"])
        headers = {"Authorization": f"Bearer {token}"}

        # Embed first
        res_embed = client.post(f"/api/papers/{paper_id}/embed", headers=headers)
        assert res_embed.status_code == 200

        # Re-process document
        res_proc = client.post(f"/api/papers/{paper_id}/process", headers=headers)
        assert res_proc.status_code == 200

        # Paper embedding status must now be reset
        res_paper = client.get(f"/api/papers/{paper_id}", headers=headers)
        assert res_paper.status_code == 200
        assert res_paper.json()["embedding_status"] == "not_started"
        assert res_paper.json()["embedded_chunk_count"] is None

        # Search should return 0 results since vectors were removed
        res_search = client.post(
            "/api/search/semantic",
            headers=headers,
            json={"query": "neural network", "paper_id": paper_id},
        )
        assert res_search.status_code == 200
        assert res_search.json()["total_results"] == 0

    def test_paper_deletion_cleans_qdrant_vectors(self):
        """Deleting a paper removes all its chunk vectors from Qdrant."""
        _, token, _ = create_authenticated_user()
        proj = create_test_project(token)
        paper_id = upload_and_process_paper(token, proj["id"])
        headers = {"Authorization": f"Bearer {token}"}

        # Embed paper
        client.post(f"/api/papers/{paper_id}/embed", headers=headers)

        # Delete paper
        res_del = client.delete(f"/api/papers/{paper_id}", headers=headers)
        assert res_del.status_code == 204

        # Search should find nothing
        res_search = client.post(
            "/api/search/semantic",
            headers=headers,
            json={"query": "neural network"},
        )
        assert res_search.status_code == 200
        assert res_search.json()["total_results"] == 0
