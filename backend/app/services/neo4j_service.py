"""Neo4j graph database integration service."""
import logging
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import settings
from app.schemas.graph import GraphEdge, GraphNode, Neo4jStatusResponse

logger = logging.getLogger(__name__)


class Neo4jService:
    """Service handling Neo4j graph driver connectivity, Cypher upserts, and querying."""

    def __init__(self) -> None:
        self._driver: Any = None

    def _get_driver(self) -> Any:
        """Lazy-initialize official Neo4j driver."""
        if not settings.NEO4J_URI or not settings.NEO4J_PASSWORD:
            return None

        if self._driver is None:
            try:
                from neo4j import GraphDatabase
                auth = (settings.NEO4J_USER, settings.NEO4J_PASSWORD)
                self._driver = GraphDatabase.driver(
                    settings.NEO4J_URI,
                    auth=auth,
                    connection_timeout=3.0,
                    max_connection_lifetime=60,
                )
            except Exception as exc:
                logger.warning("Failed to initialize Neo4j driver: %s", exc)
                self._driver = None
        return self._driver

    def get_status(self) -> Neo4jStatusResponse:
        """Returns safe connectivity status without exposing passwords."""
        uri = settings.NEO4J_URI or "bolt://localhost:7687"
        if not settings.NEO4J_PASSWORD or not settings.NEO4J_PASSWORD.strip():
            return Neo4jStatusResponse(
                status="Not configured",
                uri=uri,
                message="Neo4j password is not configured in backend environment.",
            )

        try:
            driver = self._get_driver()
            if not driver:
                return Neo4jStatusResponse(
                    status="Not configured",
                    uri=uri,
                    message="Neo4j driver could not be initialized.",
                )
            driver.verify_connectivity()
            return Neo4jStatusResponse(
                status="Connected",
                uri=uri,
                message="Successfully connected to Neo4j database.",
            )
        except Exception as exc:
            logger.warning("Neo4j connectivity check failed: %s", exc)
            return Neo4jStatusResponse(
                status="Unavailable",
                uri=uri,
                message=f"Neo4j is unreachable at {uri}.",
            )

    def is_available(self) -> bool:
        """Returns boolean indicating if Neo4j is connected and operational."""
        return self.get_status().status == "Connected"

    def upsert_paper_graph(
        self,
        paper_id: str,
        nodes: List[GraphNode],
        edges: List[GraphEdge],
    ) -> bool:
        """Upserts nodes and relationships into Neo4j using deterministic Cypher MERGE."""
        if not self.is_available():
            logger.info("Skipping Neo4j upsert: Neo4j is not connected.")
            return False

        driver = self._get_driver()
        try:
            with driver.session() as session:
                # 1. Clear existing relationships for this paper to allow safe regeneration
                session.run(
                    "MATCH (p:Paper {id: $paper_id})-[r]-() DELETE r",
                    paper_id=paper_id,
                )

                # 2. Upsert Nodes
                allowed_labels = {"Paper", "Author", "Topic", "Method", "Dataset"}
                for node in nodes:
                    label = node.label if node.label in allowed_labels else "Topic"
                    query = f"MERGE (n:{label} {{id: $id}}) SET n.name = $name"
                    session.run(query, id=node.id, name=node.name)

                # 3. Upsert Relationships
                allowed_edge_labels = {"AUTHORED_BY", "DISCUSSES", "USES_METHOD", "USES_DATASET", "RELATED_TO"}
                for edge in edges:
                    label = edge.label if edge.label in allowed_edge_labels else "RELATED_TO"
                    query = (
                        f"MATCH (s {{id: $source}}), (t {{id: $target}}) "
                        f"MERGE (s)-[r:{label}]->(t)"
                    )
                    session.run(query, source=edge.source, target=edge.target)

            return True
        except Exception as exc:
            logger.error("Failed to upsert knowledge graph into Neo4j: %s", exc)
            return False

    def get_paper_graph(
        self,
        paper_id: str,
    ) -> Optional[Tuple[List[GraphNode], List[GraphEdge]]]:
        """Retrieves paper knowledge graph subgraph from Neo4j."""
        if not self.is_available():
            return None

        driver = self._get_driver()
        try:
            with driver.session() as session:
                query = (
                    "MATCH (p:Paper {id: $paper_id})-[r]-(n) "
                    "RETURN p, n, startNode(r).id as src_id, endNode(r).id as tgt_id, type(r) as r_type"
                )
                result = session.run(query, paper_id=paper_id)
                nodes_map: Dict[str, GraphNode] = {}
                edges_list: List[GraphEdge] = []
                edge_ids_seen = set()

                for record in result:
                    p = record["p"]
                    n = record["n"]
                    src = record["src_id"]
                    tgt = record["tgt_id"]
                    r_type = record["r_type"]

                    # Paper Node
                    p_id = p.get("id") or paper_id
                    if p_id not in nodes_map:
                        nodes_map[p_id] = GraphNode(
                            id=p_id,
                            label="Paper",
                            name=p.get("name") or "Research Paper",
                        )

                    # Neighbor Node
                    n_id = n.get("id")
                    labels = list(n.labels) if hasattr(n, "labels") else ["Topic"]
                    n_label = labels[0] if labels else "Topic"
                    if n_id and n_id not in nodes_map:
                        nodes_map[n_id] = GraphNode(
                            id=n_id,
                            label=n_label,
                            name=n.get("name") or n_id,
                        )

                    # Edge
                    if src and tgt and r_type:
                        edge_id = f"{src}_{r_type}_{tgt}"
                        if edge_id not in edge_ids_seen:
                            edge_ids_seen.add(edge_id)
                            edges_list.append(
                                GraphEdge(
                                    id=edge_id,
                                    source=src,
                                    target=tgt,
                                    label=r_type,
                                )
                            )

                if nodes_map:
                    return list(nodes_map.values()), edges_list
                return None
        except Exception as exc:
            logger.error("Failed to query Neo4j for paper graph: %s", exc)
            return None

    def close(self) -> None:
        """Closes Neo4j driver connection pool."""
        if self._driver:
            try:
                self._driver.close()
            except Exception:
                pass
            self._driver = None


neo4j_service = Neo4jService()
