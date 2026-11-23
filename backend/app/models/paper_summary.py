"""Paper summary model for structured scientific summaries and evidence citations."""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, TYPE_CHECKING
from sqlalchemy import String, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.paper import Paper


class PaperSummary(Base):
    """Stores structured grounded summary and source references for an indexed research paper."""
    __tablename__ = "paper_summaries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    paper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("papers.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    summary_data: Mapped[Dict[str, Any]] = mapped_column(
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

    paper: Mapped["Paper"] = relationship(
        "Paper",
        back_populates="summary",
    )
