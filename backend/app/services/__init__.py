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
from app.services.embedding import EmbeddingService, embedding_service
from app.services.qdrant_service import QdrantService, qdrant_service
from app.services.llm import LLMService, llm_service, BaseLLMProvider, GroqProvider
from app.services.context_builder import RAGContextBuilder, context_builder
from app.services.rag_service import RAGService, rag_service

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
    "EmbeddingService",
    "embedding_service",
    "QdrantService",
    "qdrant_service",
    "LLMService",
    "llm_service",
    "BaseLLMProvider",
    "GroqProvider",
    "RAGContextBuilder",
    "context_builder",
    "RAGService",
    "rag_service",
]
