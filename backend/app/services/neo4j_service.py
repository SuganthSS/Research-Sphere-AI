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

    def get_graph_context(
        self,
        paper_ids: List[str],
        max_relationships: int = 30,
    ) -> Dict[str, Any]:
        """Traverses Neo4j for 1-2 hop relationships strictly constrained to allowed paper IDs."""
        if not self.is_available() or not paper_ids:
            return {"entities": [], "relationships": [], "context_text": ""}

        driver = self._get_driver()
        if not driver:
            return {"entities": [], "relationships": [], "context_text": ""}

        entities_set = set()
        relationships_list = []
        rel_signatures = set()

        try:
            with driver.session() as session:
                # 1. 1-hop traversal: Paper -> Author, Topic, Method, Dataset
                query_1hop = (
                    "MATCH (p:Paper)-[r]-(e) "
                    "WHERE p.id IN $paper_ids "
                    "RETURN p.name as paper_name, type(r) as r_type, labels(e)[0] as e_label, e.name as e_name "
                    "LIMIT $limit"
                )
                res_1hop = session.run(query_1hop, paper_ids=paper_ids, limit=max_relationships)
                for record in res_1hop:
                    paper_name = record["paper_name"] or "Paper"
                    r_type = record["r_type"]
                    e_label = record["e_label"] or "Entity"
                    e_name = record["e_name"]
                    if not e_name:
                        continue
                    entities_set.add(e_name)
                    sig = (paper_name, r_type, e_name)
                    if sig not in rel_signatures:
                        rel_signatures.add(sig)
                        relationships_list.append(f"Paper '{paper_name}' {r_type} {e_label} '{e_name}'")

                # 2. 2-hop traversal: Topic -[:RELATED_TO]-> Topic
                query_2hop_topics = (
                    "MATCH (p:Paper)-[:DISCUSSES]->(t1:Topic)-[r:RELATED_TO]-(t2:Topic) "
                    "WHERE p.id IN $paper_ids AND t1.name <> t2.name "
                    "RETURN DISTINCT t1.name as topic1, t2.name as topic2 "
                    "LIMIT 10"
                )
                res_2hop = session.run(query_2hop_topics, paper_ids=paper_ids)
                for record in res_2hop:
                    t1 = record["topic1"]
                    t2 = record["topic2"]
                    if t1 and t2:
                        entities_set.add(t1)
                        entities_set.add(t2)
                        sig = (t1, "RELATED_TO", t2)
                        sig_rev = (t2, "RELATED_TO", t1)
                        if sig not in rel_signatures and sig_rev not in rel_signatures:
                            rel_signatures.add(sig)
                            relationships_list.append(f"Topic '{t1}' RELATED_TO Topic '{t2}'")

                # 3. 2-hop cross-paper links between allowed papers
                if len(paper_ids) > 1:
                    query_cross = (
                        "MATCH (p1:Paper)-[r1]-(e)-[r2]-(p2:Paper) "
                        "WHERE p1.id IN $paper_ids AND p2.id IN $paper_ids AND p1.id < p2.id "
                        "RETURN p1.name as paper1_name, type(r1) as r1_type, e.name as e_name, labels(e)[0] as e_label, type(r2) as r2_type, p2.name as paper2_name "
                        "LIMIT 10"
                    )
                    res_cross = session.run(query_cross, paper_ids=paper_ids)
                    for record in res_cross:
                        p1_name = record["paper1_name"] or "Paper 1"
                        p2_name = record["paper2_name"] or "Paper 2"
                        e_name = record["e_name"]
                        e_label = record["e_label"] or "Entity"
                        r1_type = record["r1_type"]
                        r2_type = record["r2_type"]
                        if e_name:
                            entities_set.add(e_name)
                            sig = (p1_name, e_name, p2_name)
                            if sig not in rel_signatures:
                                rel_signatures.add(sig)
                                relationships_list.append(
                                    f"Paper '{p1_name}' ({r1_type}) and Paper '{p2_name}' ({r2_type}) both connect to {e_label} '{e_name}'"
                                )

            context_lines = [f"- {rel}" for rel in relationships_list]
            context_text = "\n".join(context_lines)

            return {
                "entities": sorted(list(entities_set)),
                "relationships": relationships_list,
                "context_text": context_text,
            }
        except Exception as exc:
            logger.error("Failed to retrieve graph context from Neo4j: %s", exc)
            return {"entities": [], "relationships": [], "context_text": ""}

    def close(self) -> None:
        """Closes Neo4j driver connection pool."""
        if self._driver:
            try:
                self._driver.close()
            except Exception:
                pass
            self._driver = None


neo4j_service = Neo4jService()
