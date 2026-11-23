"""Service layer package."""
from app.services.paper_storage import PaperStorageService, paper_storage, StorageSecurityError
from app.services.pdf_extraction import (
    PDFExtractionService,
    pdf_extractor,
    PDFExtractionError,
    ExtractedPageResult,
    DocumentExtractionResult,
)
from app.services.text_cleaning import clean_page_text
from app.services.section_detection import detect_section_in_text, build_page_section_map
from app.services.document_chunking import chunk_document, ChunkResult
from app.services.document_processing import (
    DocumentProcessingService,
    document_processor,
    DocumentProcessingError,
    ProcessingResult,
)

__all__ = [
    "PaperStorageService",
    "paper_storage",
    "StorageSecurityError",
    "PDFExtractionService",
    "pdf_extractor",
    "PDFExtractionError",
    "ExtractedPageResult",
    "DocumentExtractionResult",
    "clean_page_text",
    "detect_section_in_text",
    "build_page_section_map",
    "chunk_document",
    "ChunkResult",
    "DocumentProcessingService",
    "document_processor",
    "DocumentProcessingError",
    "ProcessingResult",
]

