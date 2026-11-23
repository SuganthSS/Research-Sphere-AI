"""Normalized exceptions for LLM providers."""


class LLMError(Exception):
    """Base exception for all LLM errors."""
    pass


class LLMConfigurationError(LLMError):
    """Raised when provider configuration (e.g. API key) is missing or invalid."""
    pass


class LLMAuthenticationError(LLMError):
    """Raised when authentication with LLM provider fails."""
    pass


class LLMModelNotFoundError(LLMError):
    """Raised when requested model is not found or unsupported by provider."""
    pass


class LLMRateLimitError(LLMError):
    """Raised when provider rate limit is exceeded."""
    pass


class LLMTimeoutError(LLMError):
    """Raised when LLM request times out."""
    pass


class LLMConnectionError(LLMError):
    """Raised when network connection to provider fails."""
    pass


class LLMProviderError(LLMError):
    """Raised when provider returns an error."""
    pass
