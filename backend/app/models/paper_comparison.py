"""Paper comparison model for multi-paper comparative analysis and evidence citations."""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List
from sqlalchemy import String, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PaperComparison(Base):
    """Stores structured grounded comparison across 2-5 indexed research papers."""
    __tablename__ = "paper_comparisons"

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
    paper_ids_key: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
        index=True,
    )
    paper_ids: Mapped[List[str]] = mapped_column(
        JSON,
        nullable=False,
    )
    comparison_data: Mapped[Dict[str, Any]] = mapped_column(
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
