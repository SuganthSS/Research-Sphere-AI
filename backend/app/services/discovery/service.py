"""Scholarly Paper Discovery and Open-Access Ingestion Service."""
import logging
import re
import uuid
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.paper import Paper
from app.models.paper_page import PaperPage
from app.models.project import Project
from app.schemas.discovery import (
    PaperDiscoverySearchResponse,
    PaperImportRequest,
    PaperImportResponse,
)
from app.services.discovery.base import (
    BasePaperDiscoveryProvider,
    DiscoveryProviderError,
    DiscoveryRateLimitError,
)
from app.services.discovery.openalex import OpenAlexProvider
from app.services.discovery.security import safe_download_pdf
from app.services.paper_storage import paper_storage
from app.services.pdf_extraction import pdf_extractor, PDFExtractionError

logger = logging.getLogger(__name__)


def normalize_title(title: str) -> str:
    """Normalizes title for robust duplicate matching."""
    if not title:
        return ""
    return re.sub(r"[^a-z0-9]", "", title.lower())


class PaperDiscoveryService:
    """Orchestrates scholarly search across providers and secure OA PDF ingestion."""

    def __init__(self, provider: Optional[BasePaperDiscoveryProvider] = None) -> None:
        self.provider = provider or OpenAlexProvider()

    def search_papers(
        self,
        query: str,
        limit: int = 10,
        offset: int = 0,
        open_access_only: bool = True,
        year: Optional[str] = None,
    ) -> PaperDiscoverySearchResponse:
        """Searches academic papers through the active discovery provider."""
        try:
            return self.provider.search_papers(
                query=query,
                limit=limit,
                offset=offset,
                open_access_only=open_access_only,
                year=year,
            )
        except DiscoveryRateLimitError as rle:
            logger.warning("Paper discovery rate limited: %s", rle)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Paper discovery is temporarily rate limited. Please try again shortly.",
            )
        except DiscoveryProviderError as dpe:
            logger.error("Paper discovery provider failure: %s", dpe)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Scholarly discovery failed: {str(dpe)}",
            )

    def import_paper(
        self,
        user_id: uuid.UUID,
        import_request: PaperImportRequest,
        db: Session,
    ) -> PaperImportResponse:
        """Securely imports an open-access PDF into the specified project and runs ingestion."""
        # 1. Enforce authenticated project ownership
        project = (
            db.query(Project)
            .filter(Project.id == import_request.project_id, Project.user_id == user_id)
            .first()
        )
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research project not found.",
            )

        # 2. Check for legitimate, accessible OA PDF URL
        pdf_url = import_request.open_access_pdf_url
        if not pdf_url or not pdf_url.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="PDF not openly available for this research paper.",
            )

        # 3. Duplicate Detection within Project
        existing_papers = (
            db.query(Paper)
            .filter(Paper.project_id == import_request.project_id, Paper.user_id == user_id)
            .all()
        )

        req_title_norm = normalize_title(import_request.title)
        req_doi = import_request.doi.strip().lower() if import_request.doi else None
        req_arxiv = import_request.arxiv_id.strip().lower() if import_request.arxiv_id else None
        req_ext_id = import_request.paper_id.strip() if import_request.paper_id else None

        for p in existing_papers:
            # Check 1: DOI
            if req_doi and p.doi and p.doi.strip().lower() == req_doi:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Paper already exists in this project.",
                )

            # Check 2: External Provider ID
            if req_ext_id and p.external_id and p.external_id.strip() == req_ext_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Paper already exists in this project.",
                )

            # Check 3: arXiv ID
            if req_arxiv and p.arxiv_id and p.arxiv_id.strip().lower() == req_arxiv:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Paper already exists in this project.",
                )

            # Check 4: Normalized title fallback
            if req_title_norm and normalize_title(p.title) == req_title_norm:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Paper already exists in this project.",
                )

        # 4. Safely download PDF with SSRF protection and redirect validation
        file_bytes = safe_download_pdf(pdf_url)

        # 5. Store PDF file securely using existing paper_storage
        storage_key, _ = paper_storage.save(file_bytes, user_id, import_request.project_id)

        # 6. Generate filename from title
        clean_base = re.sub(r"[^a-zA-Z0-9_\-]", "_", import_request.title)[:80].strip("_")
        original_filename = f"{clean_base if clean_base else 'paper'}.pdf"

        # 7. Create Paper record in PostgreSQL
        paper = Paper(
            user_id=user_id,
            project_id=import_request.project_id,
            title=import_request.title,
            original_filename=original_filename,
            stored_filename=storage_key,
            file_size=len(file_bytes),
            mime_type="application/pdf",
            status="uploaded",
            extraction_status="not_started",
            doi=import_request.doi,
            external_id=import_request.paper_id,
            arxiv_id=import_request.arxiv_id,
            venue=import_request.venue,
            year=import_request.year,
            citation_count=import_request.citation_count,
            authors_str=", ".join(import_request.authors) if import_request.authors else None,
            source_url=import_request.source_url,
            open_access_pdf_url=pdf_url,
        )

        try:
            db.add(paper)
            db.commit()
            db.refresh(paper)
        except Exception:
            db.rollback()
            paper_storage.delete(storage_key)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to register imported paper in database.",
            )

        # 8. Ingestion Pipeline: Trigger page extraction automatically if requested
        extraction_status_str = "not_started"
        page_count_int = None

        if import_request.auto_extract:
            paper.extraction_status = "processing"
            db.commit()
            try:
                extraction_result = pdf_extractor.extract_from_storage(paper.stored_filename)
                for p_page in extraction_result.pages:
                    cleaned_text = (p_page.text or "").replace("\x00", "")
                    db.add(
                        PaperPage(
                            paper_id=paper.id,
                            page_number=p_page.page_number,
                            text=cleaned_text,
                            character_count=len(cleaned_text),
                        )
                    )
                paper.extraction_status = "completed"
                paper.page_count = len(extraction_result.pages)
                paper.status = "processed"
                db.commit()
                db.refresh(paper)
                extraction_status_str = "completed"
                page_count_int = paper.page_count
            except PDFExtractionError as exc:
                paper.extraction_status = "failed"
                paper.extraction_error = str(exc)
                db.commit()
                logger.warning("Auto extraction failed for imported paper: %s", exc)
                extraction_status_str = "failed"
            except Exception as exc:
                paper.extraction_status = "failed"
                paper.extraction_error = "Unexpected extraction error"
                db.commit()
                logger.warning("Unexpected error during auto extraction: %s", exc)
                extraction_status_str = "failed"

        return PaperImportResponse(
            paper_id=paper.id,
            project_id=project.id,
            project_name=project.name,
            title=paper.title,
            original_filename=paper.original_filename,
            stored_filename=paper.stored_filename,
            file_size=paper.file_size,
            mime_type=paper.mime_type,
            status=paper.status,
            extraction_status=extraction_status_str,
            page_count=page_count_int,
            message="Paper imported successfully into project.",
        )


paper_discovery_service = PaperDiscoveryService()
