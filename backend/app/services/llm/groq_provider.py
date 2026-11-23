"""Groq LLM provider implementation using official groq Python SDK."""
import logging
from typing import Any, Dict, Optional

from app.core.config import settings
from app.services.llm.base import BaseLLMProvider
from app.services.llm.exceptions import (
    LLMAuthenticationError,
    LLMConfigurationError,
    LLMConnectionError,
    LLMModelNotFoundError,
    LLMProviderError,
    LLMRateLimitError,
    LLMTimeoutError,
)

logger = logging.getLogger(__name__)


class GroqProvider(BaseLLMProvider):
    """Groq API provider implementing BaseLLMProvider."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: Optional[int] = None,
    ) -> None:
        self.api_key = api_key if api_key is not None else settings.GROQ_API_KEY
        self.model = model or settings.GROQ_MODEL
        self.timeout = timeout or settings.GROQ_TIMEOUT_SECONDS
        self._client: Any = None

    @property
    def client(self) -> Any:
        """Lazy-initialize official Groq client."""
        if not self.api_key or not self.api_key.strip():
            raise LLMConfigurationError(
                "Groq API key is not configured. Please set GROQ_API_KEY in the backend environment."
            )
        if self._client is None:
            try:
                from groq import Groq
                self._client = Groq(api_key=self.api_key, timeout=self.timeout)
            except Exception as exc:
                logger.error("Failed to instantiate Groq client: %s", exc)
                raise LLMProviderError(f"Failed to initialize Groq client: {str(exc)}") from exc
        return self._client

    def generate(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.1,
    ) -> str:
        """Execute chat completion call via Groq API with robust error normalization."""
        # Ensure client can be instantiated (or raise LLMConfigurationError)
        client = self.client

        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        try:
            response = client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
            )
            if not response.choices or not response.choices[0].message:
                raise LLMProviderError("Empty response received from Groq LLM.")

            content = response.choices[0].message.content or ""
            return content.strip()

        except LLMConfigurationError:
            raise
        except Exception as exc:
            cls_name = exc.__class__.__name__
            if "NotFoundError" in cls_name and self.model != "qwen/qwen3.8-27b":
                logger.warning("Groq model %s not found, attempting fallback to qwen/qwen3.8-27b", self.model)
                try:
                    resp = client.chat.completions.create(
                        model="qwen/qwen3.8-27b",
                        messages=messages,
                        temperature=temperature,
                    )
                    if resp.choices and resp.choices[0].message:
                        return (resp.choices[0].message.content or "").strip()
                except Exception as fallback_exc:
                    logger.error("Fallback to qwen/qwen3.8-27b also failed: %s", fallback_exc)
            if "AuthenticationError" in cls_name:
                logger.error("Groq authentication failure")
                raise LLMAuthenticationError("Groq authentication failed: invalid API key.") from exc
            elif "NotFoundError" in cls_name:
                logger.error("Groq model not found: %s", self.model)
                raise LLMModelNotFoundError(
                    f"Configured Groq model '{self.model}' is not available."
                ) from exc
            elif "RateLimitError" in cls_name:
                logger.warning("Groq rate limit exceeded")
                raise LLMRateLimitError(
                    "Groq rate limit exceeded. Please wait a moment before trying again."
                ) from exc
            elif "APITimeoutError" in cls_name or "Timeout" in cls_name:
                logger.error("Groq request timed out after %ds", self.timeout)
                raise LLMTimeoutError(
                    f"Groq request timed out after {self.timeout} seconds."
                ) from exc
            elif "APIConnectionError" in cls_name or "Connection" in cls_name:
                logger.error("Failed to connect to Groq API")
                raise LLMConnectionError(
                    "Failed to connect to Groq API. Please verify network connectivity."
                ) from exc
            elif "APIStatusError" in cls_name or "APIError" in cls_name:
                status_code = getattr(exc, "status_code", "unknown")
                logger.error("Groq API error status %s", status_code)
                raise LLMProviderError(f"Groq service error (status {status_code}).") from exc
            else:
                logger.error("Unexpected error during Groq completion: %s", exc)
                raise LLMProviderError(f"Unexpected LLM provider error: {str(exc)}") from exc

    def get_status(self) -> Dict[str, Any]:
        """Return safe status of Groq configuration without exposing secret key."""
        if not self.api_key or not self.api_key.strip():
            return {
                "provider": "groq",
                "model": self.model,
                "configured": False,
                "status": "not_configured",
                "message": "GROQ_API_KEY is not configured.",
            }
        return {
            "provider": "groq",
            "model": self.model,
            "configured": True,
            "status": "configured",
            "message": "Groq provider configured and available.",
        }
