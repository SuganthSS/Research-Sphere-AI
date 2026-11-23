"""Base scholarly discovery provider interface."""
from abc import ABC, abstractmethod
from typing import Optional

from app.schemas.discovery import PaperDiscoverySearchResponse


class DiscoveryProviderError(Exception):
    """General error communicating with an external scholarly metadata provider."""
    pass


class DiscoveryRateLimitError(DiscoveryProviderError):
    """Raised when an external scholarly API rate limits requests."""
    pass


class BasePaperDiscoveryProvider(ABC):
    """Abstract scholarly paper discovery provider interface."""

    @abstractmethod
    def search_papers(
        self,
        query: str,
        limit: int = 10,
        offset: int = 0,
        open_access_only: bool = True,
        year: Optional[str] = None,
    ) -> PaperDiscoverySearchResponse:
        """Search papers from the academic provider."""
        pass
