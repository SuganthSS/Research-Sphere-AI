"""Qdrant vector search service for ResearchSphere paper chunks."""
import logging
import uuid
from typing import Any, Dict, List, Optional
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    FilterSelector,
    PayloadSchemaType,
)

from app.core.config import settings

logger = logging.getLogger(__name__)


class QdrantService:
    """Manages vector collections, chunk vector indexing, and ownership-isolated similarity search."""

    def __init__(
        self,
        url: Optional[str] = None,
        collection_name: Optional[str] = None,
    ) -> None:
        self.url = url or settings.QDRANT_URL
        self.collection_name = collection_name or settings.QDRANT_COLLECTION
        self._client: Optional[QdrantClient] = None

    @property
    def client(self) -> QdrantClient:
        """Lazy-initialized QdrantClient."""
        if self._client is None:
            self._client = QdrantClient(url=self.url)
        return self._client

    def check_health(self) -> bool:
        """Checks if Qdrant instance is reachable and responding."""
        try:
            self.client.get_collections()
            return True
        except Exception as exc:
            logger.warning("Qdrant health check failed: %s", exc)
            return False

    def ensure_collection(self, vector_size: int = 384) -> None:
        """Ensures that the target Qdrant collection and payload indexes exist."""
        try:
            if not self.client.collection_exists(self.collection_name):
                logger.info("Creating Qdrant collection '%s' with dim %d", self.collection_name, vector_size)
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
                )
                # Create keyword payload indexes for rapid filtered retrieval
                for field in ["user_id", "project_id", "paper_id"]:
                    try:
                        self.client.create_payload_index(
                            collection_name=self.collection_name,
                            field_name=field,
                            field_schema=PayloadSchemaType.KEYWORD,
                        )
                    except Exception as idx_err:
                        logger.warning("Could not create payload index for %s: %s", field, idx_err)
        except Exception as exc:
            logger.error("Failed to ensure collection '%s': %s", self.collection_name, exc)
            raise

    def upsert_chunks(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        paper_id: uuid.UUID,
        chunks: List[Any],
        embeddings: List[List[float]],
    ) -> int:
        """Upsert embedded chunks into Qdrant with deterministic chunk UUIDs and rich metadata."""
        if not chunks:
            return 0
        if len(chunks) != len(embeddings):
            raise ValueError(f"Mismatched counts: {len(chunks)} chunks vs {len(embeddings)} embeddings")

        vector_size = len(embeddings[0]) if embeddings else 384
        self.ensure_collection(vector_size=vector_size)

        points = []
        for chunk, emb in zip(chunks, embeddings):
            chunk_id_str = str(chunk.id)
            payload = {
                "user_id": str(user_id),
                "project_id": str(project_id),
                "paper_id": str(paper_id),
                "chunk_id": chunk_id_str,
                "chunk_index": getattr(chunk, "chunk_index", 0),
                "section_name": getattr(chunk, "section_name", "Unknown") or "Unknown",
                "start_page": getattr(chunk, "start_page", 1),
                "end_page": getattr(chunk, "end_page", 1),
                "text": getattr(chunk, "text", ""),
                "character_count": getattr(chunk, "character_count", 0),
                "token_count_estimate": getattr(chunk, "token_count_estimate", 0),
            }
            points.append(PointStruct(id=chunk_id_str, vector=emb, payload=payload))

        # Batch upsert points
        batch_size = 100
        total_upserted = 0
        for i in range(0, len(points), batch_size):
            batch = points[i : i + batch_size]
            self.client.upsert(collection_name=self.collection_name, points=batch)
            total_upserted += len(batch)

        logger.info("Successfully upserted %d chunk vectors for paper %s", total_upserted, paper_id)
        return total_upserted

    def delete_paper_vectors(self, paper_id: uuid.UUID) -> bool:
        """Delete all vectors belonging to a specific paper (e.g. on re-processing or deletion)."""
        try:
            if not self.client.collection_exists(self.collection_name):
                return True

            self.client.delete(
                collection_name=self.collection_name,
                points_selector=FilterSelector(
                    filter=Filter(
                        must=[
                            FieldCondition(
                                key="paper_id",
                                match=MatchValue(value=str(paper_id)),
                            )
                        ]
                    )
                ),
            )
            logger.info("Deleted vectors for paper %s from Qdrant", paper_id)
            return True
        except Exception as exc:
            logger.warning("Error deleting vectors for paper %s: %s", paper_id, exc)
            return False

    def delete_project_vectors(self, project_id: uuid.UUID) -> bool:
        """Delete all vectors belonging to a specific project."""
        try:
            if not self.client.collection_exists(self.collection_name):
                return True

            self.client.delete(
                collection_name=self.collection_name,
                points_selector=FilterSelector(
                    filter=Filter(
                        must=[
                            FieldCondition(
                                key="project_id",
                                match=MatchValue(value=str(project_id)),
                            )
                        ]
                    )
                ),
            )
            logger.info("Deleted vectors for project %s from Qdrant", project_id)
            return True
        except Exception as exc:
            logger.warning("Error deleting vectors for project %s: %s", project_id, exc)
            return False

    def search(
        self,
        query_vector: List[float],
        user_id: uuid.UUID,
        project_id: Optional[uuid.UUID] = None,
        paper_id: Optional[uuid.UUID] = None,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """Perform semantic similarity search with strictly enforced user isolation and optional scoping."""
        if not self.client.collection_exists(self.collection_name):
            return []

        # Strict ownership filter: user_id is MANDATORY
        must_conditions = [
            FieldCondition(key="user_id", match=MatchValue(value=str(user_id)))
        ]

        if paper_id is not None:
            must_conditions.append(
                FieldCondition(key="paper_id", match=MatchValue(value=str(paper_id)))
            )
        elif project_id is not None:
            must_conditions.append(
                FieldCondition(key="project_id", match=MatchValue(value=str(project_id)))
            )

        query_filter = Filter(must=must_conditions)

        res = self.client.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            query_filter=query_filter,
            limit=limit,
        )

        results = []
        for pt in res.points:
            p = pt.payload or {}
            results.append({
                "score": round(float(pt.score), 4),
                "chunk_id": p.get("chunk_id", str(pt.id)),
                "paper_id": p.get("paper_id"),
                "project_id": p.get("project_id"),
                "chunk_index": p.get("chunk_index", 0),
                "section_name": p.get("section_name", "Unknown"),
                "start_page": p.get("start_page", 1),
                "end_page": p.get("end_page", 1),
                "text": p.get("text", ""),
                "character_count": p.get("character_count", 0),
                "token_count_estimate": p.get("token_count_estimate", 0),
            })

        return results


qdrant_service = QdrantService()
