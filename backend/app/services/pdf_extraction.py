"""PDF extraction service for page-preserved scientific text extraction using PyMuPDF."""
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional
import pymupdf

from app.services.paper_storage import paper_storage, PaperStorageService


class PDFExtractionError(Exception):
    """Raised when PDF extraction fails due to unreadable, corrupt, or missing document."""
    pass


@dataclass
class ExtractedPageResult:
    page_number: int  # 1-indexed (1, 2, 3...)
    text: str
    character_count: int


@dataclass
class DocumentExtractionResult:
    page_count: int
    pages: List[ExtractedPageResult]
    total_characters: int


class PDFExtractionService:
    def __init__(self, storage: Optional[PaperStorageService] = None):
        self._storage = storage or paper_storage

    def extract_from_storage(self, storage_key: str) -> DocumentExtractionResult:
        """Securely loads and extracts text from a PDF in paper storage."""
        file_path = self._storage.get_path(storage_key)
        if not file_path or not file_path.is_file():
            raise PDFExtractionError("PDF document file could not be located in storage.")
        return self.extract_from_file(file_path)

    def extract_from_file(self, file_path: Path) -> DocumentExtractionResult:
        """Extracts text page-by-page from a physical PDF file using PyMuPDF."""
        try:
            doc = pymupdf.open(str(file_path))
        except Exception as e:
            raise PDFExtractionError("Failed to open PDF document. File may be corrupt or invalid.") from e

        try:
            return self._extract_pages(doc)
        finally:
            doc.close()

    def extract_from_bytes(self, file_bytes: bytes) -> DocumentExtractionResult:
        """Extracts text page-by-page from raw PDF bytes using PyMuPDF."""
        try:
            doc = pymupdf.open(stream=file_bytes, filetype="pdf")
        except Exception as e:
            raise PDFExtractionError("Failed to parse PDF document bytes.") from e

        try:
            return self._extract_pages(doc)
        finally:
            doc.close()

    def _extract_pages(self, doc: pymupdf.Document) -> DocumentExtractionResult:
        page_count = len(doc)
        pages: List[ExtractedPageResult] = []
        total_chars = 0

        for idx, page in enumerate(doc):
            # Human-readable 1-based page number
            page_number = idx + 1
            # Extract plain text faithfully without altering equations or references
            raw_text = page.get_text("text") or ""
            clean_text = raw_text.strip()
            char_count = len(clean_text)
            total_chars += char_count

            pages.append(
                ExtractedPageResult(
                    page_number=page_number,
                    text=clean_text,
                    character_count=char_count,
                )
            )

        return DocumentExtractionResult(
            page_count=page_count,
            pages=pages,
            total_characters=total_chars,
        )


# Singleton instance
pdf_extractor = PDFExtractionService()
