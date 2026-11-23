"""Abstract base class for LLM providers."""
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class BaseLLMProvider(ABC):
    """Abstract interface defining the contract for LLM inference providers."""

    @abstractmethod
    def generate(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: Optional[int] = None,
    ) -> str:
        """Generate text completion for given prompt and optional system instruction."""
        pass

    @abstractmethod
    def get_status(self) -> Dict[str, Any]:
        """Return safe, non-sensitive provider availability and configuration status."""
        pass
