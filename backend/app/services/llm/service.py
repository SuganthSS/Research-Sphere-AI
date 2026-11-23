"""High-level LLM service."""
import logging
import time
from typing import Any, Dict, Optional

from app.services.llm.base import BaseLLMProvider
from app.services.llm.groq_provider import GroqProvider

logger = logging.getLogger(__name__)


class LLMService:
    """High-level facade over LLM provider with error containment and telemetry."""

    def __init__(self, provider: Optional[BaseLLMProvider] = None) -> None:
        self._provider = provider

    @property
    def provider(self) -> BaseLLMProvider:
        """Returns active provider, defaulting to GroqProvider."""
        if self._provider is None:
            self._provider = GroqProvider()
        return self._provider

    def set_provider(self, provider: BaseLLMProvider) -> None:
        """Dynamically replace provider (useful for unit tests and alternative backends)."""
        self._provider = provider

    def generate_grounded_answer(
        self,
        prompt: str,
        system_instruction: str,
        temperature: float = 0.1,
    ) -> str:
        """Generate grounded completion using configured provider."""
        start_time = time.time()
        result = self.provider.generate(
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=temperature,
        )
        duration = round(time.time() - start_time, 3)
        logger.info(
            "LLM generation finished in %ss (%d chars output)",
            duration,
            len(result),
        )
        return result

    def get_status(self) -> Dict[str, Any]:
        """Retrieve safe provider status."""
        return self.provider.get_status()


llm_service = LLMService()
