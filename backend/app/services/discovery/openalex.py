"""OpenAlex scholarly discovery provider implementation."""
import logging
import re
from typing import Any, Dict, List, Optional
import httpx

from app.schemas.discovery import DiscoveredPaperItem, PaperDiscoverySearchResponse
from app.services.discovery.base import (
    BasePaperDiscoveryProvider,
    DiscoveryProviderError,
    DiscoveryRateLimitError,
)

logger = logging.getLogger(__name__)

OPENALEX_API_BASE = "https://api.openalex.org"


def reconstruct_abstract(inverted_index: Optional[Dict[str, List[int]]]) -> Optional[str]:
    """Reconstructs text from OpenAlex's abstract_inverted_index mapping."""
    if not inverted_index or not isinstance(inverted_index, dict):
        return None

    word_positions = []
    for word, positions in inverted_index.items():
        for pos in positions:
            word_positions.append((pos, word))

    word_positions.sort(key=lambda x: x[0])
    text = " ".join([word for _, word in word_positions])
    return text if text.strip() else None


def extract_arxiv_id(doi: Optional[str], landing_url: Optional[str], pdf_url: Optional[str]) -> Optional[str]:
    """Extracts clean arXiv ID from DOI or URL if present."""
    for text in (doi, landing_url, pdf_url):
        if not text:
            continue
        # Format 1: 10.48550/arXiv.2404.16130
        m = re.search(r"arxiv\.(?:org/(?:abs|pdf)/)?([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)", text, re.IGNORECASE)
        if m:
            return m.group(1)
        # Format 2: arxiv.org/abs/2404.16130
        m2 = re.search(r"arxiv\.org/(?:abs|pdf)/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)", text, re.IGNORECASE)
        if m2:
            return m2.group(1)
    return None


class OpenAlexProvider(BasePaperDiscoveryProvider):
    """Scholarly discovery provider backed by the OpenAlex Academic Graph API."""

    def __init__(self, email: str = "researchsphere@example.com") -> None:
        self.email = email
        self.headers = {
            "User-Agent": f"ResearchSphere-AI/1.0 (mailto:{self.email})",
            "Accept": "application/json",
        }

    def search_papers(
        self,
        query: str,
        limit: int = 10,
        offset: int = 0,
        open_access_only: bool = True,
        year: Optional[str] = None,
    ) -> PaperDiscoverySearchResponse:
        """Searches OpenAlex works for papers matching query and filters."""
        if not query or not query.strip():
            return PaperDiscoverySearchResponse(
                query="",
                total_results=0,
                papers=[],
                provider="openalex",
                message="Please provide a search query.",
            )

        clean_query = query.strip()
        per_page = max(1, min(limit, 25))
        page = (offset // per_page) + 1

        params: Dict[str, Any] = {
            "search": clean_query,
            "per-page": per_page,
            "page": page,
        }

        # Filters
        filter_parts = []
        if open_access_only:
            filter_parts.append("is_oa:true")
        if year:
            clean_year = year.strip()
            if clean_year:
                filter_parts.append(f"publication_year:{clean_year}")

        if filter_parts:
            params["filter"] = ",".join(filter_parts)

        url = f"{OPENALEX_API_BASE}/works"

        try:
            with httpx.Client(timeout=15.0) as client:
                res = client.get(url, params=params, headers=self.headers)
        except httpx.TimeoutException:
            logger.error("OpenAlex API timeout for query '%s'", clean_query)
            raise DiscoveryProviderError("OpenAlex scholarly search timed out. Please try again.")
        except Exception as exc:
            logger.error("Failed connecting to OpenAlex: %s", exc)
            raise DiscoveryProviderError(f"Could not reach OpenAlex discovery service: {str(exc)}")

        if res.status_code == 429:
            raise DiscoveryRateLimitError("Paper discovery is temporarily rate limited. Please try again shortly.")

        if res.status_code != 200:
            logger.error("OpenAlex returned HTTP %s: %s", res.status_code, res.text)
            raise DiscoveryProviderError(f"OpenAlex service returned HTTP {res.status_code}.")

        try:
            data = res.json()
        except Exception:
            raise DiscoveryProviderError("Invalid JSON returned by OpenAlex.")

        total_count = data.get("meta", {}).get("count", 0)
        raw_works = data.get("results", [])

        discovered_papers: List[DiscoveredPaperItem] = []

        for w in raw_works:
            raw_id = w.get("id") or ""
            paper_id = raw_id.replace("https://openalex.org/", "") or raw_id

            title = w.get("title") or "Untitled Document"

            # Authors
            authors: List[str] = []
            for authorship in w.get("authorships", []):
                name = authorship.get("author", {}).get("display_name")
                if name and name not in authors:
                    authors.append(name)

            pub_year = w.get("publication_year")

            # Venue / Source
            primary_loc = w.get("primary_location") or {}
            source_info = primary_loc.get("source") or {}
            venue = source_info.get("display_name")

            # Abstract
            abstract = reconstruct_abstract(w.get("abstract_inverted_index"))

            # Citations
            citation_count = int(w.get("cited_by_count") or 0)

            # DOI
            raw_doi = w.get("doi")
            clean_doi = raw_doi.replace("https://doi.org/", "") if raw_doi else None

            # Open Access & Best PDF URL
            oa_data = w.get("open_access") or {}
            is_oa = bool(oa_data.get("is_oa", False))

            best_oa = w.get("best_oa_location") or {}
            pdf_url = best_oa.get("pdf_url") or primary_loc.get("pdf_url")

            # Validate that PDF URL is HTTPS; ignore non-HTTPS
            if pdf_url and not pdf_url.lower().startswith("https://"):
                pdf_url = None

            landing_url = best_oa.get("landing_page_url") or primary_loc.get("landing_page_url") or raw_doi or raw_id
            arxiv_id = extract_arxiv_id(clean_doi, landing_url, pdf_url)

            # Concepts / Topics
            topics = [c.get("display_name") for c in w.get("concepts", []) if c.get("display_name")][:5]

            discovered_papers.append(
                DiscoveredPaperItem(
                    paper_id=paper_id,
                    title=title,
                    authors=authors,
                    year=pub_year,
                    venue=venue,
                    abstract=abstract,
                    citation_count=citation_count,
                    doi=clean_doi,
                    arxiv_id=arxiv_id,
                    source_url=landing_url,
                    is_open_access=is_oa,
                    open_access_pdf_url=pdf_url,
                    provider="openalex",
                    topics=topics,
                )
            )

        return PaperDiscoverySearchResponse(
            query=clean_query,
            total_results=total_count,
            papers=discovered_papers,
            provider="openalex",
            message=None if discovered_papers else "No scientific papers found matching your query.",
        )
