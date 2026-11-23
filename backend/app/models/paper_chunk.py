"""PaperChunk model — text chunks generated from document processing pipeline."""
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.paper import Paper


class PaperChunk(Base):
    """A single text chunk extracted from a research paper's processed content."""

    __tablename__ = "paper_chunks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    paper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("papers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    section_name: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )
    text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    character_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    token_count_estimate: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    start_page: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    end_page: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationship back to Paper
    paper: Mapped["Paper"] = relationship("Paper", back_populates="chunks")

    __table_args__ = (
        UniqueConstraint("paper_id", "chunk_index", name="uq_paper_chunks_paper_chunk"),
        Index("ix_paper_chunks_paper_id", "paper_id"),
    )
