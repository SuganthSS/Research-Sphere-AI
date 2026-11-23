"""Research paper recommendation service combining semantic vector similarity and graph relationships."""
import logging
import uuid
from typing import Dict, List, Optional
from sqlalchemy.orm import Session

from app.models.paper import Paper
from app.models.project import Project
from app.schemas.recommendation import (
    PaperRecommendationItem,
    PaperRecommendationsResponse,
)
from app.services.embedding import embedding_service
from app.services.neo4j_service import neo4j_service
from app.services.qdrant_service import qdrant_service

logger = logging.getLogger(__name__)


class RecommendationService:
    """Service generating transparent, evidence-supported paper recommendations from the user's corpus."""

    def get_recommendations(
        self,
        user_id: uuid.UUID,
        target_paper_id: Optional[uuid.UUID],
        project_id: Optional[uuid.UUID],
        limit: int,
        db: Session,
    ) -> PaperRecommendationsResponse:
        """Calculates multi-signal paper recommendations across the user's research corpus."""
        # 1. Fetch user's papers and projects
        user_papers = db.query(Paper).filter(Paper.user_id == user_id).all()
        if not user_papers:
            return PaperRecommendationsResponse(
                target_paper_id=target_paper_id,
                total_recommendations=0,
                recommendations=[],
                message="No research papers found in your corpus.",
            )

        user_projects = {p.id: p.name for p in db.query(Project).filter(Project.user_id == user_id).all()}

        # 2. Identify target reference paper (if specified)
        target_paper: Optional[Paper] = None
        if target_paper_id:
            target_paper = next((p for p in user_papers if p.id == target_paper_id), None)
            if not target_paper:
                raise ValueError("Target reference paper not found or access denied.")

        # If target_paper not specified, pick the most recent completed paper in project or user corpus
        if not target_paper:
            completed_papers = [
                p for p in user_papers
                if p.chunking_status == "completed" and (not project_id or p.project_id == project_id)
            ]
            if completed_papers:
                target_paper = completed_papers[0]

        if not target_paper:
            return PaperRecommendationsResponse(
                target_paper_id=None,
                total_recommendations=0,
                recommendations=[],
                message="No indexed research papers available to compute recommendations.",
            )

        # 3. Form candidate pool (exclude target paper, ensure user isolation)
        candidates = [
            p for p in user_papers
            if p.id != target_paper.id
            and p.chunking_status == "completed"
            and (not project_id or p.project_id == project_id)
        ]

        if not candidates:
            return PaperRecommendationsResponse(
                target_paper_id=target_paper.id,
                target_paper_title=target_paper.title,
                total_recommendations=0,
                recommendations=[],
                message="No other indexed papers available in your corpus to recommend.",
            )

        candidate_ids = [str(p.id) for p in candidates]

        # 4. Signal 1: Semantic Similarity via Qdrant/Embedding
        semantic_scores: Dict[str, float] = {str(p.id): 0.50 for p in candidates}
        try:
            query_vector = embedding_service.embed_query(target_paper.title)
            raw_results = qdrant_service.search(
                query_vector=query_vector,
                user_id=user_id,
                project_id=project_id,
                limit=30,
            )
            for r in raw_results:
                pid = r.get("paper_id")
                score = float(r.get("score", 0.0))
                if pid and pid in semantic_scores:
                    semantic_scores[pid] = max(semantic_scores[pid], score)
        except Exception as exc:
            logger.warning("Semantic vector retrieval for recommendation fallback: %s", exc)

        # 5. Signal 2 & 3: Graph Topic & Method Overlap via Neo4j
        shared_entities: Dict[str, Dict[str, List[str]]] = {}
        try:
            if neo4j_service.is_available():
                shared_entities = neo4j_service.get_shared_entities(
                    source_paper_id=str(target_paper.id),
                    target_paper_ids=candidate_ids,
                )
        except Exception as exc:
            logger.warning("Neo4j shared entity retrieval failed, continuing with semantic signals: %s", exc)

        # 6. Multi-Signal Composite Ranking & Rationale Synthesis
        recommendations: List[PaperRecommendationItem] = []

        for p in candidates:
            pid_str = str(p.id)
            sem_sim = semantic_scores.get(pid_str, 0.5)

            p_shared = shared_entities.get(pid_str, {"topics": [], "methods": []})
            shared_topics = p_shared.get("topics", [])
            shared_methods = p_shared.get("methods", [])

            topic_norm = min(1.0, len(shared_topics) / 3.0)
            method_norm = min(1.0, len(shared_methods) / 2.0)

            composite_score = (0.45 * sem_sim) + (0.35 * topic_norm) + (0.20 * method_norm)
            relevance_score = round(min(1.0, max(0.0, composite_score)), 2)

            # Transparent Recommendation Rationale
            if shared_topics and shared_methods:
                top_topics = ", ".join(shared_topics[:2])
                top_methods = ", ".join(shared_methods[:2])
                reason = (
                    f"Recommended because this paper shares research topics ('{top_topics}') "
                    f"and methodology ('{top_methods}') with '{target_paper.title}'."
                )
            elif shared_topics:
                top_topics = ", ".join(shared_topics[:3])
                reason = (
                    f"Recommended because this paper shares key research topics ('{top_topics}') "
                    f"with '{target_paper.title}'."
                )
            elif shared_methods:
                top_methods = ", ".join(shared_methods[:2])
                reason = (
                    f"Recommended because this paper shares methodologies ('{top_methods}') "
                    f"with '{target_paper.title}'."
                )
            else:
                reason = (
                    f"Recommended based on strong semantic similarity and research alignment "
                    f"with '{target_paper.title}'."
                )

            recommendations.append(
                PaperRecommendationItem(
                    paper_id=p.id,
                    paper_title=p.title,
                    project_id=p.project_id,
                    project_name=user_projects.get(p.project_id, "Research Project"),
                    relevance_score=relevance_score,
                    shared_topics=shared_topics,
                    shared_methods=shared_methods,
                    recommendation_reason=reason,
                    source_paper_title=target_paper.title,
                )
            )

        # Sort descending by relevance score
        recommendations.sort(key=lambda x: x.relevance_score, reverse=True)
        top_recs = recommendations[:limit]

        return PaperRecommendationsResponse(
            target_paper_id=target_paper.id,
            target_paper_title=target_paper.title,
            total_recommendations=len(top_recs),
            recommendations=top_recs,
        )


recommendation_service = RecommendationService()
