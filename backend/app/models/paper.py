"""Paper model for scientific manuscripts, articles, and research documents."""
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING
from sqlalchemy import String, Integer, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.project import Project
    from app.models.paper_page import PaperPage
    from app.models.paper_chunk import PaperChunk


class Paper(Base):
    __tablename__ = "papers"

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
    title: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )
    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    stored_filename: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
        unique=True,
    )
    file_size: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    mime_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="application/pdf",
    )
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="uploaded",
    )
    extraction_status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="not_started",
    )
    page_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        default=None,
    )
    extracted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    extraction_error: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True,
        default=None,
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

    # Chunking / processing metadata (populated by Module 4)
    chunking_status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="not_started",
        server_default="not_started",
    )
    chunk_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        default=None,
    )
    chunked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    chunking_error: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True,
        default=None,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="papers")
    project: Mapped["Project"] = relationship("Project", back_populates="papers")
    pages: Mapped[list["PaperPage"]] = relationship(
        "PaperPage",
        back_populates="paper",
        cascade="all, delete-orphan",
        order_by="PaperPage.page_number",
    )
    chunks: Mapped[list["PaperChunk"]] = relationship(
        "PaperChunk",
        back_populates="paper",
        cascade="all, delete-orphan",
        order_by="PaperChunk.chunk_index",
    )

    __table_args__ = (
        Index("ix_papers_user_project", "user_id", "project_id"),
        Index("ix_papers_created_at", "created_at"),
    )
