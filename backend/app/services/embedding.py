"""Embedding service using SentenceTransformers for research paper chunk vectorization."""
import logging
from typing import List, Optional
from sentence_transformers import SentenceTransformer

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Provides vector embeddings for text chunks and search queries using SentenceTransformers."""

    def __init__(self, model_name: Optional[str] = None) -> None:
        self.model_name = model_name or settings.EMBEDDING_MODEL
        self._model: Optional[SentenceTransformer] = None

    @property
    def model(self) -> SentenceTransformer:
        """Lazy-loaded SentenceTransformer model instance."""
        if self._model is None:
            logger.info("Loading embedding model: %s", self.model_name)
            self._model = SentenceTransformer(self.model_name)
            logger.info("Embedding model %s loaded successfully", self.model_name)
        return self._model

    @property
    def dimension(self) -> int:
        """Embedding vector dimension (e.g., 384 for all-MiniLM-L6-v2)."""
        if hasattr(self.model, "get_embedding_dimension"):
            dim = self.model.get_embedding_dimension()
        else:
            dim = self.model.get_sentence_embedding_dimension()
        return int(dim) if dim is not None else 384

    def embed_texts(
        self,
        texts: List[str],
        batch_size: Optional[int] = None,
    ) -> List[List[float]]:
        """Embed a list of text strings in batches with L2 normalization (for cosine distance).

        Returns a list of float lists.
        """
        if not texts:
            return []

        bs = batch_size or settings.EMBEDDING_BATCH_SIZE
        embeddings = self.model.encode(
            texts,
            batch_size=bs,
            normalize_embeddings=True,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        return embeddings.tolist()

    def embed_query(self, query: str) -> List[float]:
        """Embed a single search query string with L2 normalization."""
        if not query or not query.strip():
            raise ValueError("Query string cannot be empty.")

        embedding = self.model.encode(
            query.strip(),
            normalize_embeddings=True,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        return embedding.tolist()


embedding_service = EmbeddingService()
