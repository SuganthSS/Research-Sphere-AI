"""Research Gap model for storing evidence-grounded potential research gaps across research literature."""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List
from sqlalchemy import String, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ResearchGapAnalysis(Base):
    """Stores structured evidence-supported potential research gaps discovered from research literature."""
    __tablename__ = "research_gap_analyses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    paper_ids_key: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
        index=True,
    )
    paper_ids: Mapped[List[str]] = mapped_column(
        JSON,
        nullable=False,
    )
    analysis_data: Mapped[Dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
    )
    model_provider: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="groq",
    )
    model_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="llama-3.3-70b-versatile",
    )
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
