"""Targeted test suite for Module 12-13: Research Recommendations & Researcher Discovery.

Covers:
1. test_semantic_paper_recommendation
2. test_graph_topic_overlap
3. test_method_overlap
4. test_recommendation_ranking
5. test_ownership_isolation
6. test_researcher_extraction_from_corpus
7. test_researcher_relevance
8. test_collaboration_explanation
9. test_conservative_collaboration_wording
10. test_empty_insufficient_corpus
11. test_neo4j_unavailable_handling
12. test_api_response_structures
"""
import uuid
from typing import Any, Dict, List
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.paper import Paper
from app.models.paper_graph import PaperGraph
from app.models.project import Project
from app.db.session import SessionLocal
from app.schemas.researcher import COLLABORATION_CAUTION_NOTICE
from app.services.recommendation_service import RecommendationService
from app.services.researcher_service import ResearcherDiscoveryService

client = TestClient(app)


# ---------------------------------------------------------------------------
# Test Helpers
# ---------------------------------------------------------------------------

def create_test_user_and_project(suffix: str = "") -> tuple[dict, str, Project]:
    """Helper creating user, logging in, and creating a project."""
    email = f"recuser_{suffix}_{uuid.uuid4().hex[:6]}@example.com"
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
            name=f"Project {suffix}",
            description="Testing Module 12-13",
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        return user_data, token, project
    finally:
        db.close()


def add_test_paper(user_id: uuid.UUID, project_id: uuid.UUID, title: str) -> Paper:
    """Helper adding an indexed paper."""
    db = SessionLocal()
    try:
        paper = Paper(
            id=uuid.uuid4(),
            user_id=user_id,
            project_id=project_id,
            title=title,
            original_filename=f"{title.replace(' ', '_').lower()}.pdf",
            stored_filename=f"stored_{uuid.uuid4().hex}.pdf",
            file_size=1024,
            mime_type="application/pdf",
            status="processed",
            chunking_status="completed",
            embedding_status="completed",
        )
        db.add(paper)
        db.commit()
        db.refresh(paper)
        return paper
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 1. test_semantic_paper_recommendation
# ---------------------------------------------------------------------------

def test_semantic_paper_recommendation():
    """Validates semantic similarity signal boosts recommendation relevance."""
    user_data, token, project = create_test_user_and_project("sem")
    user_id = uuid.UUID(user_data["id"])

    p1 = add_test_paper(user_id, project.id, "Deep Graph Neural Networks")
    p2 = add_test_paper(user_id, project.id, "Graph Embeddings for NLP")

    rec_service = RecommendationService()
    db = SessionLocal()
    try:
        with patch("app.services.embedding.embedding_service.embed_query", return_value=[0.1] * 384), \
             patch("app.services.qdrant_service.qdrant_service.search", return_value=[{"paper_id": str(p2.id), "score": 0.88}]), \
             patch("app.services.neo4j_service.neo4j_service.get_shared_entities", return_value={}):

            resp = rec_service.get_recommendations(
                user_id=user_id,
                target_paper_id=p1.id,
                project_id=project.id,
                limit=5,
                db=db,
            )

            assert resp.total_recommendations == 1
            item = resp.recommendations[0]
            assert item.paper_id == p2.id
            assert item.relevance_score > 0.35
            assert "semantic similarity" in item.recommendation_reason.lower()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 2. test_graph_topic_overlap
# ---------------------------------------------------------------------------

def test_graph_topic_overlap():
    """Validates Neo4j shared topics contribute to recommendation rationale and score."""
    user_data, token, project = create_test_user_and_project("topic")
    user_id = uuid.UUID(user_data["id"])

    p1 = add_test_paper(user_id, project.id, "Knowledge Graphs in Medicine")
    p2 = add_test_paper(user_id, project.id, "Biomedical Entity Linking")

    rec_service = RecommendationService()
    db = SessionLocal()
    try:
        mock_shared = {
            str(p2.id): {
                "topics": ["Knowledge Graph", "Biomedicine", "Ontologies"],
                "methods": [],
            }
        }
        with patch("app.services.embedding.embedding_service.embed_query", return_value=[0.1] * 384), \
             patch("app.services.qdrant_service.qdrant_service.search", return_value=[]), \
             patch("app.services.neo4j_service.neo4j_service.get_shared_entities", return_value=mock_shared):

            resp = rec_service.get_recommendations(
                user_id=user_id,
                target_paper_id=p1.id,
                project_id=project.id,
                limit=5,
                db=db,
            )

            assert resp.total_recommendations == 1
            rec = resp.recommendations[0]
            assert "Knowledge Graph" in rec.shared_topics
            assert "Biomedicine" in rec.shared_topics
            assert "research topics" in rec.recommendation_reason
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 3. test_method_overlap
# ---------------------------------------------------------------------------

def test_method_overlap():
    """Validates Neo4j shared methods contribute to recommendation rationale and score."""
    user_data, token, project = create_test_user_and_project("method")
    user_id = uuid.UUID(user_data["id"])

    p1 = add_test_paper(user_id, project.id, "Transformer Attention Optimization")
    p2 = add_test_paper(user_id, project.id, "Efficient LLM Inference")

    rec_service = RecommendationService()
    db = SessionLocal()
    try:
        mock_shared = {
            str(p2.id): {
                "topics": [],
                "methods": ["FlashAttention", "KV-Cache Quantization"],
            }
        }
        with patch("app.services.embedding.embedding_service.embed_query", return_value=[0.1] * 384), \
             patch("app.services.qdrant_service.qdrant_service.search", return_value=[]), \
             patch("app.services.neo4j_service.neo4j_service.get_shared_entities", return_value=mock_shared):

            resp = rec_service.get_recommendations(
                user_id=user_id,
                target_paper_id=p1.id,
                project_id=project.id,
                limit=5,
                db=db,
            )

            assert resp.total_recommendations == 1
            rec = resp.recommendations[0]
            assert "FlashAttention" in rec.shared_methods
            assert "methodologies" in rec.recommendation_reason.lower()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 4. test_recommendation_ranking
# ---------------------------------------------------------------------------

def test_recommendation_ranking():
    """Verifies composite scoring ranking: composite = (0.45*sem) + (0.35*topic_norm) + (0.20*method_norm)."""
    user_data, token, project = create_test_user_and_project("rank")
    user_id = uuid.UUID(user_data["id"])

    p_ref = add_test_paper(user_id, project.id, "Reference Paper")
    p_high = add_test_paper(user_id, project.id, "High Overlap Paper")
    p_low = add_test_paper(user_id, project.id, "Low Overlap Paper")

    rec_service = RecommendationService()
    db = SessionLocal()
    try:
        mock_shared = {
            str(p_high.id): {
                "topics": ["T1", "T2", "T3"],
                "methods": ["M1", "M2"],
            },
            str(p_low.id): {
                "topics": [],
                "methods": [],
            },
        }
        mock_qdrant = [
            {"paper_id": str(p_high.id), "score": 0.90},
            {"paper_id": str(p_low.id), "score": 0.30},
        ]

        with patch("app.services.embedding.embedding_service.embed_query", return_value=[0.1] * 384), \
             patch("app.services.qdrant_service.qdrant_service.search", return_value=mock_qdrant), \
             patch("app.services.neo4j_service.neo4j_service.get_shared_entities", return_value=mock_shared):

            resp = rec_service.get_recommendations(
                user_id=user_id,
                target_paper_id=p_ref.id,
                project_id=project.id,
                limit=5,
                db=db,
            )

            assert resp.total_recommendations == 2
            # p_high has sem=0.90, topic_norm=1.0, method_norm=1.0 => 0.45*0.90 + 0.35*1.0 + 0.20*1.0 = 0.955
            # p_low has sem=0.30, topic_norm=0, method_norm=0 => 0.45*0.30 = 0.135
            assert resp.recommendations[0].paper_id == p_high.id
            assert resp.recommendations[1].paper_id == p_low.id
            assert resp.recommendations[0].relevance_score > resp.recommendations[1].relevance_score
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 5. test_ownership_isolation
# ---------------------------------------------------------------------------

def test_ownership_isolation():
    """User B cannot receive User A's papers in recommendations or researcher discovery."""
    user_a_data, token_a, proj_a = create_test_user_and_project("usera")
    user_b_data, token_b, proj_b = create_test_user_and_project("userb")

    p_a = add_test_paper(uuid.UUID(user_a_data["id"]), proj_a.id, "Secret Study by User A")
    p_b = add_test_paper(uuid.UUID(user_b_data["id"]), proj_b.id, "User B Open Work")

    # User B requests recommendations
    headers_b = {"Authorization": f"Bearer {token_b}"}
    res_rec = client.get(
        f"/api/recommendations/papers?target_paper_id={p_b.id}",
        headers=headers_b,
    )
    assert res_rec.status_code == 200
    rec_json = res_rec.json()
    recommended_ids = [r["paper_id"] for r in rec_json.get("recommendations", [])]
    assert str(p_a.id) not in recommended_ids

    # User B tries to specify User A's paper as target
    res_target_a = client.get(
        f"/api/recommendations/papers?target_paper_id={p_a.id}",
        headers=headers_b,
    )
    assert res_target_a.status_code == 404

    # User B requests researchers
    res_res = client.get("/api/researchers", headers=headers_b)
    assert res_res.status_code == 200
    for researcher in res_res.json().get("researchers", []):
        for paper_brief in researcher.get("papers", []):
            assert paper_brief["paper_id"] != str(p_a.id)


# ---------------------------------------------------------------------------
# 6. test_researcher_extraction_from_corpus
# ---------------------------------------------------------------------------

def test_researcher_extraction_from_corpus():
    """Validates author extraction from Neo4j into structured profiles."""
    user_data, token, project = create_test_user_and_project("extract")
    user_id = uuid.UUID(user_data["id"])
    p1 = add_test_paper(user_id, project.id, "Paper on Climate AI")

    mock_neo4j_authors = [
        {
            "author_id": "author_chen_123",
            "name": "Dr. Sarah Chen",
            "paper_ids": [str(p1.id)],
            "paper_titles": [p1.title],
            "topics": ["Climate Modeling", "Neural Operators"],
            "methods": ["Fourier Neural Operator"],
        }
    ]

    res_service = ResearcherDiscoveryService()
    db = SessionLocal()
    try:
        with patch("app.services.neo4j_service.neo4j_service.is_available", return_value=True), \
             patch("app.services.neo4j_service.neo4j_service.get_corpus_researchers", return_value=mock_neo4j_authors):

            resp = res_service.discover_researchers(user_id=user_id, project_id=project.id, db=db)

            assert resp.total_researchers == 1
            r = resp.researchers[0]
            assert r.name == "Dr. Sarah Chen"
            assert r.author_id == "author_chen_123"
            assert len(r.papers) == 1
            assert r.papers[0].paper_title == "Paper on Climate AI"
            assert "Fourier Neural Operator" in r.methods
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 7. test_researcher_relevance
# ---------------------------------------------------------------------------

def test_researcher_relevance():
    """Verifies researcher relevance scoring formula based on publications, topics, and methods."""
    user_data, token, project = create_test_user_and_project("rel")
    user_id = uuid.UUID(user_data["id"])
    p1 = add_test_paper(user_id, project.id, "Pub 1")
    p2 = add_test_paper(user_id, project.id, "Pub 2")

    mock_author = [
        {
            "author_id": "author_alex",
            "name": "Prof. Alex Rivera",
            "paper_ids": [str(p1.id), str(p2.id)],
            "paper_titles": [p1.title, p2.title],
            "topics": ["Topic A", "Topic B"],
            "methods": ["Method M"],
        }
    ]

    res_service = ResearcherDiscoveryService()
    db = SessionLocal()
    try:
        with patch("app.services.neo4j_service.neo4j_service.is_available", return_value=True), \
             patch("app.services.neo4j_service.neo4j_service.get_corpus_researchers", return_value=mock_author):

            resp = res_service.discover_researchers(user_id=user_id, project_id=project.id, db=db)
            # Expected score: 0.45 + (0.15 * 2) + (0.05 * 2) + (0.05 * 1) = 0.45 + 0.30 + 0.10 + 0.05 = 0.90
            r = resp.researchers[0]
            assert r.relevance_score == 0.90
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 8. test_collaboration_explanation
# ---------------------------------------------------------------------------

def test_collaboration_explanation():
    """Validates transparent collaboration explanation incorporates domain, method, and corpus count."""
    user_data, token, project = create_test_user_and_project("expl")
    user_id = uuid.UUID(user_data["id"])
    p1 = add_test_paper(user_id, project.id, "Quantum Optimization")

    mock_author = [
        {
            "author_id": "author_quantum",
            "name": "Dr. Marcus Vance",
            "paper_ids": [str(p1.id)],
            "paper_titles": [p1.title],
            "topics": ["QAOA", "Combinatorics"],
            "methods": ["VQE"],
        }
    ]

    res_service = ResearcherDiscoveryService()
    db = SessionLocal()
    try:
        with patch("app.services.neo4j_service.neo4j_service.is_available", return_value=True), \
             patch("app.services.neo4j_service.neo4j_service.get_corpus_researchers", return_value=mock_author):

            resp = res_service.discover_researchers(user_id=user_id, project_id=project.id, db=db)
            r = resp.researchers[0]
            explanation = r.collaboration_explanation
            assert "QAOA" in explanation or "Combinatorics" in explanation
            assert "VQE" in explanation
            assert "1 publication(s) in your corpus" in explanation
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 9. test_conservative_collaboration_wording
# ---------------------------------------------------------------------------

def test_conservative_collaboration_wording():
    """Validates conservative 'Potential Collaboration Match' badge and mandatory caution banner."""
    user_data, token, project = create_test_user_and_project("caut")
    user_id = uuid.UUID(user_data["id"])
    p1 = add_test_paper(user_id, project.id, "Safety Paper")

    mock_author = [
        {
            "author_id": "author_safe",
            "name": "Dr. Elena Rostova",
            "paper_ids": [str(p1.id)],
            "paper_titles": [p1.title],
            "topics": ["Alignment"],
            "methods": ["RLHF"],
        }
    ]

    res_service = ResearcherDiscoveryService()
    db = SessionLocal()
    try:
        with patch("app.services.neo4j_service.neo4j_service.is_available", return_value=True), \
             patch("app.services.neo4j_service.neo4j_service.get_corpus_researchers", return_value=mock_author):

            resp = res_service.discover_researchers(user_id=user_id, project_id=project.id, db=db)
            assert resp.caution_notice == COLLABORATION_CAUTION_NOTICE
            assert "do not indicate researcher availability or willingness to collaborate" in resp.caution_notice
            r = resp.researchers[0]
            assert r.match_label == "Potential Collaboration Match"
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 10. test_empty_insufficient_corpus
# ---------------------------------------------------------------------------

def test_empty_insufficient_corpus():
    """Validates truthful empty states when corpus is empty or has only 1 paper."""
    user_data, token, project = create_test_user_and_project("empty")
    user_id = uuid.UUID(user_data["id"])

    rec_service = RecommendationService()
    res_service = ResearcherDiscoveryService()
    db = SessionLocal()
    try:
        # Case A: 0 papers
        resp_rec_0 = rec_service.get_recommendations(
            user_id=user_id,
            target_paper_id=None,
            project_id=project.id,
            limit=5,
            db=db,
        )
        assert resp_rec_0.total_recommendations == 0
        assert "No research papers found" in resp_rec_0.message

        resp_res_0 = res_service.discover_researchers(user_id=user_id, project_id=project.id, db=db)
        assert resp_res_0.total_researchers == 0
        assert "No research papers available" in resp_res_0.message

        # Case B: 1 paper (no candidates to recommend)
        p1 = add_test_paper(user_id, project.id, "Solo Paper")
        resp_rec_1 = rec_service.get_recommendations(
            user_id=user_id,
            target_paper_id=p1.id,
            project_id=project.id,
            limit=5,
            db=db,
        )
        assert resp_rec_1.total_recommendations == 0
        assert "No other indexed papers available" in resp_rec_1.message
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 11. test_neo4j_unavailable_handling
# ---------------------------------------------------------------------------

def test_neo4j_unavailable_handling():
    """Validates graceful degradation when Neo4j is offline."""
    user_data, token, project = create_test_user_and_project("neo4joff")
    user_id = uuid.UUID(user_data["id"])

    p1 = add_test_paper(user_id, project.id, "Paper Alpha")
    p2 = add_test_paper(user_id, project.id, "Paper Beta")

    # Add PostgreSQL graph backup
    db = SessionLocal()
    try:
        pg = PaperGraph(
            paper_id=p1.id,
            graph_data={
                "nodes": [
                    {"id": "auth_offline", "name": "Prof. Backup", "label": "Author"},
                    {"id": "top_offline", "name": "Robust Systems", "label": "Topic"},
                ],
                "edges": [],
            },
        )
        db.add(pg)
        db.commit()

        # Recommendation fallback when Neo4j throws
        rec_service = RecommendationService()
        with patch("app.services.embedding.embedding_service.embed_query", return_value=[0.1] * 384), \
             patch("app.services.qdrant_service.qdrant_service.search", return_value=[]), \
             patch("app.services.neo4j_service.neo4j_service.get_shared_entities", side_effect=Exception("Neo4j connection refused")):

            rec_resp = rec_service.get_recommendations(
                user_id=user_id,
                target_paper_id=p1.id,
                project_id=project.id,
                limit=5,
                db=db,
            )
            # Degrades gracefully, doesn't throw 500
            assert rec_resp.total_recommendations == 1

        # Researcher discovery fallback to PostgreSQL when Neo4j is unavailable
        res_service = ResearcherDiscoveryService()
        with patch("app.services.neo4j_service.neo4j_service.is_available", return_value=False):
            res_resp = res_service.discover_researchers(user_id=user_id, project_id=project.id, db=db)
            assert res_resp.total_researchers == 1
            assert res_resp.researchers[0].name == "Prof. Backup"
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 12. test_api_response_structures
# ---------------------------------------------------------------------------

def test_api_response_structures():
    """Validates HTTP API endpoints contracts for recommendations and researcher discovery."""
    user_data, token, project = create_test_user_and_project("api")
    user_id = uuid.UUID(user_data["id"])

    p1 = add_test_paper(user_id, project.id, "API Test Paper 1")
    p2 = add_test_paper(user_id, project.id, "API Test Paper 2")

    headers = {"Authorization": f"Bearer {token}"}

    # 1. GET /api/recommendations/papers
    res_rec = client.get(
        f"/api/recommendations/papers?target_paper_id={p1.id}&project_id={project.id}",
        headers=headers,
    )
    assert res_rec.status_code == 200
    rec_body = res_rec.json()
    assert "target_paper_id" in rec_body
    assert "total_recommendations" in rec_body
    assert "recommendations" in rec_body
    assert isinstance(rec_body["recommendations"], list)
    if rec_body["recommendations"]:
        item = rec_body["recommendations"][0]
        for field in ["paper_id", "paper_title", "relevance_score", "shared_topics", "shared_methods", "recommendation_reason"]:
            assert field in item

    # 2. GET /api/researchers
    mock_author = [
        {
            "author_id": "author_api_spec",
            "name": "Dr. Spec Tester",
            "paper_ids": [str(p1.id)],
            "paper_titles": [p1.title],
            "topics": ["API Standards"],
            "methods": ["Automated Verification"],
        }
    ]
    with patch("app.services.neo4j_service.neo4j_service.is_available", return_value=True), \
         patch("app.services.neo4j_service.neo4j_service.get_corpus_researchers", return_value=mock_author):

        res_res = client.get(
            f"/api/researchers?project_id={project.id}",
            headers=headers,
        )
        assert res_res.status_code == 200
        res_body = res_res.json()
        assert "total_researchers" in res_body
        assert "researchers" in res_body
        assert "caution_notice" in res_body
        assert res_body["total_researchers"] == 1

        r_spec = res_body["researchers"][0]
        for field in ["author_id", "name", "papers_count", "papers", "topics", "methods", "relevance_score", "match_label", "collaboration_explanation"]:
            assert field in r_spec

        # 3. GET /api/researchers/{author_id}
        res_single = client.get(
            f"/api/researchers/{r_spec['author_id']}",
            headers=headers,
        )
        assert res_single.status_code == 200
        single_body = res_single.json()
        assert single_body["author_id"] == "author_api_spec"
        assert single_body["name"] == "Dr. Spec Tester"
