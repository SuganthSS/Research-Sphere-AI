"""Document processing orchestration service.

Coordinates text cleaning → section detection → chunking → persistence.
Operates on already-extracted PaperPage records. Does NOT touch raw
PaperPage.text — cleaning produces a derived representation only.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import List, TYPE_CHECKING

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.services.document_chunking import chunk_document, ChunkResult
from app.models.paper_chunk import PaperChunk

if TYPE_CHECKING:
    from app.models.paper import Paper


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class DocumentProcessingError(Exception):
    """Raised when the document processing pipeline encounters a recoverable error."""


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class ProcessingResult:
    paper_id: uuid.UUID
    chunk_count: int
    sections_detected: List[str]
    chunked_at: datetime


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class DocumentProcessingService:
    """Orchestrates the full document processing pipeline for a paper."""

    def process_paper(self, paper: "Paper", db: Session) -> ProcessingResult:
        """Run text cleaning, section detection, chunking, and persist PaperChunks.

        Idempotent: existing PaperChunk rows for this paper are deleted before
        new ones are inserted.

        Raises:
            DocumentProcessingError: on any pipeline failure.
        """
        try:
            # 1. Load pages (already ordered by PaperPage.page_number via relationship)
            pages = list(paper.pages)

            if not pages:
                raise DocumentProcessingError(
                    "Paper has no extracted pages. Run text extraction first."
                )

            # 2. Run chunking pipeline (cleaning + section detection + chunking)
            chunks: List[ChunkResult] = chunk_document(pages)

            # 3. Idempotently delete existing chunks
            db.execute(delete(PaperChunk).where(PaperChunk.paper_id == paper.id))
            db.flush()

            # 4. Persist new chunks
            now_utc = datetime.now(timezone.utc)
            for chunk in chunks:
                db.add(PaperChunk(
                    paper_id=paper.id,
                    chunk_index=chunk.chunk_index,
                    section_name=chunk.section_name,
                    text=chunk.text,
                    character_count=chunk.character_count,
                    token_count_estimate=chunk.token_count_estimate,
                    start_page=chunk.start_page,
                    end_page=chunk.end_page,
                    created_at=now_utc,
                ))

            # 5. Update Paper metadata
            chunk_count = len(chunks)
            paper.chunk_count = chunk_count
            paper.chunked_at = now_utc
            paper.chunking_status = "completed"
            paper.chunking_error = None

            db.commit()
            db.refresh(paper)

            # 6. Derive unique ordered sections from chunks
            seen: dict = {}
            for chunk in chunks:
                sn = chunk.section_name or "Unknown"
                if sn not in seen:
                    seen[sn] = True
            sections_detected = list(seen.keys())

            return ProcessingResult(
                paper_id=paper.id,
                chunk_count=chunk_count,
                sections_detected=sections_detected,
                chunked_at=now_utc,
            )

        except DocumentProcessingError:
            raise
        except Exception as exc:
            raise DocumentProcessingError(
                f"Unexpected error during document processing: {exc}"
            ) from exc


# Module-level singleton
document_processor = DocumentProcessingService()
