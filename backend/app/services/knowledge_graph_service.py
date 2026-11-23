"""Scientific Knowledge Graph Service."""
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session

from app.models.paper import Paper
from app.models.paper_chunk import PaperChunk
from app.models.paper_graph import PaperGraph
from app.schemas.graph import GraphEdge, GraphNode, KnowledgeGraphResponse
from app.services.llm.service import llm_service
from app.services.neo4j_service import neo4j_service

logger = logging.getLogger(__name__)

GRAPH_SYSTEM_INSTRUCTION = """You are ResearchSphere AI, an expert scientific knowledge graph entity extractor.
Extract key scientific entities and relationships from the provided research paper text.
You MUST extract ONLY explicitly mentioned facts. Never hallucinate or assume missing information.

REQUIRED JSON OUTPUT FORMAT:
{
  "authors": ["Author Name 1", "Author Name 2"],
  "topics": ["Research Topic / Field 1", "Topic 2"],
  "methods": ["Algorithm / Model / Architecture 1", "Method 2"],
  "datasets": ["Benchmark / Corpus / Dataset 1", "Dataset 2"],
  "related_topics": [["Topic 1", "Topic 2"]]
}

RULES:
1. Provide at most 4 concise authors, 5 topics, 4 methods, and 3 datasets.
2. If authors are not mentioned, return "authors": [].
3. Only include datasets if an explicit dataset or benchmark is named; otherwise "datasets": [].
4. Return ONLY the JSON object. No commentary."""


class KnowledgeGraphError(Exception):
    """Base knowledge graph exception."""
    pass


class KnowledgeGraphPreconditionError(KnowledgeGraphError):
    """Raised when paper is not ready or unowned."""
    pass


def slugify(text: str) -> str:
    """Generate safe lowercase ASCII identifier."""
    cleaned = re.sub(r"[^\w\s-]", "", text.strip().lower())
    return re.sub(r"[-\s]+", "_", cleaned)[:50]


class KnowledgeGraphService:
    """Service orchestrating entity extraction, validation, and graph persistence in Neo4j and PostgreSQL."""

    def _collect_paper_context(self, paper: Paper, db: Session) -> str:
        """Collects the most informative chunks (abstract, introduction, methods)."""
        chunks = (
            db.query(PaperChunk)
            .filter(PaperChunk.paper_id == paper.id)
            .order_by(PaperChunk.chunk_index.asc())
            .limit(5)
            .all()
        )
        if not chunks:
            return f"Title: {paper.title}"
        
        parts = [f"Title: {paper.title}"]
        for c in chunks:
            parts.append(f"Section ({c.section_name or 'General'}):\n{c.text.strip()}")
        return "\n\n".join(parts)

    def _parse_entities(self, raw_response: str) -> Dict[str, Any]:
        """Parses and cleans JSON response from Groq."""
        cleaned = raw_response.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

        try:
            data = json.loads(cleaned)
        except Exception:
            match = re.search(r"\{[\s\S]*\}", cleaned)
            if match:
                try:
                    data = json.loads(match.group(0))
                except Exception:
                    data = {}
            else:
                data = {}

        return {
            "authors": [str(a).strip() for a in data.get("authors", []) if str(a).strip()][:5],
            "topics": [str(t).strip() for t in data.get("topics", []) if str(t).strip()][:6],
            "methods": [str(m).strip() for m in data.get("methods", []) if str(m).strip()][:5],
            "datasets": [str(d).strip() for d in data.get("datasets", []) if str(d).strip()][:4],
            "related_topics": data.get("related_topics", [])[:4],
        }

    def generate_paper_graph(
        self,
        paper_id: uuid.UUID,
        user_id: uuid.UUID,
        db: Session,
    ) -> KnowledgeGraphResponse:
        """Generates knowledge graph for a paper, saves to PostgreSQL, and syncs to Neo4j."""
        paper = db.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise KnowledgeGraphPreconditionError("Paper not found.")
        if paper.user_id != user_id:
            raise KnowledgeGraphPreconditionError("Unauthorized access to paper.")
        if paper.chunking_status != "completed":
            raise KnowledgeGraphPreconditionError("Paper chunking must be completed before generating knowledge graph.")

        # 1. Collect evidence
        context = self._collect_paper_context(paper, db)

        # 2. Extract with LLM
        prompt = (
            f"Extract scientific entities and relationships for the paper:\n\n"
            f"{context}\n\n"
            f"Follow the required JSON schema strictly."
        )

        try:
            raw_response = llm_service.generate_grounded_answer(
                prompt=prompt,
                system_instruction=GRAPH_SYSTEM_INSTRUCTION,
                temperature=0.1,
                max_tokens=600,
            )
            entities = self._parse_entities(raw_response)
        except Exception as exc:
            logger.error("LLM entity extraction failed: %s", exc)
            raise KnowledgeGraphError(f"AI Knowledge Graph generation failed: {str(exc)}") from exc

        # 3. Build Graph Nodes & Edges
        nodes: List[GraphNode] = []
        edges: List[GraphEdge] = []
        node_ids_seen = set()

        # Paper Node
        paper_node_id = str(paper.id)
        nodes.append(
            GraphNode(
                id=paper_node_id,
                label="Paper",
                name=paper.title,
                properties={"paper_id": str(paper.id)},
            )
        )
        node_ids_seen.add(paper_node_id)

        # Authors
        for auth_name in entities["authors"]:
            auth_id = f"author_{slugify(auth_name)}"
            if auth_id not in node_ids_seen:
                nodes.append(GraphNode(id=auth_id, label="Author", name=auth_name))
                node_ids_seen.add(auth_id)
            edges.append(
                GraphEdge(
                    id=f"{paper_node_id}_AUTHORED_BY_{auth_id}",
                    source=paper_node_id,
                    target=auth_id,
                    label="AUTHORED_BY",
                )
            )

        # Topics
        topic_id_map: Dict[str, str] = {}
        for topic_name in entities["topics"]:
            topic_id = f"topic_{slugify(topic_name)}"
            topic_id_map[topic_name.lower()] = topic_id
            if topic_id not in node_ids_seen:
                nodes.append(GraphNode(id=topic_id, label="Topic", name=topic_name))
                node_ids_seen.add(topic_id)
            edges.append(
                GraphEdge(
                    id=f"{paper_node_id}_DISCUSSES_{topic_id}",
                    source=paper_node_id,
                    target=topic_id,
                    label="DISCUSSES",
                )
            )

        # Methods
        for method_name in entities["methods"]:
            method_id = f"method_{slugify(method_name)}"
            if method_id not in node_ids_seen:
                nodes.append(GraphNode(id=method_id, label="Method", name=method_name))
                node_ids_seen.add(method_id)
            edges.append(
                GraphEdge(
                    id=f"{paper_node_id}_USES_METHOD_{method_id}",
                    source=paper_node_id,
                    target=method_id,
                    label="USES_METHOD",
                )
            )

        # Datasets
        for dataset_name in entities["datasets"]:
            dataset_id = f"dataset_{slugify(dataset_name)}"
            if dataset_id not in node_ids_seen:
                nodes.append(GraphNode(id=dataset_id, label="Dataset", name=dataset_name))
                node_ids_seen.add(dataset_id)
            edges.append(
                GraphEdge(
                    id=f"{paper_node_id}_USES_DATASET_{dataset_id}",
                    source=paper_node_id,
                    target=dataset_id,
                    label="USES_DATASET",
                )
            )

        # Related Topics
        for pair in entities["related_topics"]:
            if isinstance(pair, list) and len(pair) == 2:
                t1, t2 = str(pair[0]).lower(), str(pair[1]).lower()
                id1 = topic_id_map.get(t1) or f"topic_{slugify(t1)}"
                id2 = topic_id_map.get(t2) or f"topic_{slugify(t2)}"
                if id1 in node_ids_seen and id2 in node_ids_seen and id1 != id2:
                    edges.append(
                        GraphEdge(
                            id=f"{id1}_RELATED_TO_{id2}",
                            source=id1,
                            target=id2,
                            label="RELATED_TO",
                        )
                    )

        graph_payload = {
            "nodes": [n.model_dump() for n in nodes],
            "edges": [e.model_dump() for e in edges],
        }

        # 4. Persist to PostgreSQL (Source of Truth)
        existing_graph = db.query(PaperGraph).filter(PaperGraph.paper_id == paper.id).first()
        now = datetime.now(timezone.utc)
        if existing_graph:
            existing_graph.graph_data = graph_payload
            existing_graph.updated_at = now
            record = existing_graph
        else:
            record = PaperGraph(
                paper_id=paper.id,
                graph_data=graph_payload,
                created_at=now,
                updated_at=now,
            )
            db.add(record)
        db.commit()

        # 5. Sync to Neo4j if available
        neo4j_synced = neo4j_service.upsert_paper_graph(
            paper_id=str(paper.id),
            nodes=nodes,
            edges=edges,
        )

        return KnowledgeGraphResponse(
            paper_id=paper.id,
            nodes=nodes,
            edges=edges,
            neo4j_synced=neo4j_synced,
        )

    def get_paper_graph(
        self,
        paper_id: uuid.UUID,
        user_id: uuid.UUID,
        db: Session,
    ) -> Optional[KnowledgeGraphResponse]:
        """Retrieves existing graph for a paper, enforcing ownership."""
        paper = db.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise KnowledgeGraphPreconditionError("Paper not found.")
        if paper.user_id != user_id:
            raise KnowledgeGraphPreconditionError("Unauthorized access to paper.")

        record = db.query(PaperGraph).filter(PaperGraph.paper_id == paper.id).first()
        if not record:
            return None

        data = record.graph_data or {}
        raw_nodes = data.get("nodes", [])
        raw_edges = data.get("edges", [])

        nodes = [GraphNode.model_validate(n) for n in raw_nodes]
        edges = [GraphEdge.model_validate(e) for e in raw_edges]
        neo4j_synced = neo4j_service.is_available()

        return KnowledgeGraphResponse(
            paper_id=paper.id,
            nodes=nodes,
            edges=edges,
            neo4j_synced=neo4j_synced,
        )


knowledge_graph_service = KnowledgeGraphService()
