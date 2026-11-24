"""SQLAlchemy model for Paper Knowledge Graph persistence in PostgreSQL."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.db.base import Base


class PaperGraph(Base):
    """Stores generated knowledge graph nodes and edges for a paper as PostgreSQL source of truth."""

    __tablename__ = "paper_graphs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    paper_id = Column(
        UUID(as_uuid=True),
        ForeignKey("papers.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    graph_data = Column(JSONB, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    paper = relationship("Paper", back_populates="knowledge_graph")
