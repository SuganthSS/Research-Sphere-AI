"""Pydantic schemas for Scientific Knowledge Graph."""
import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class GraphNode(BaseModel):
    """Scientific Knowledge Graph node entity."""
    id: str
    label: str  # "Paper", "Author", "Topic", "Method", "Dataset"
    name: str
    properties: Dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    """Scientific Knowledge Graph directed relationship."""
    id: str
    source: str
    target: str
    label: str  # "AUTHORED_BY", "DISCUSSES", "USES_METHOD", "USES_DATASET", "RELATED_TO"
    properties: Dict[str, Any] = Field(default_factory=dict)


class KnowledgeGraphResponse(BaseModel):
    """Standard graph response format."""
    paper_id: uuid.UUID
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    neo4j_synced: bool = False


class Neo4jStatusResponse(BaseModel):
    """Neo4j graph database connectivity status."""
    status: str  # "Connected" | "Not configured" | "Unavailable"
    uri: str
    message: str
