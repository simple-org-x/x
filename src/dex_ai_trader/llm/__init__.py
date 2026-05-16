"""LLM client package.

Defines a single :class:`LLMClient` :class:`typing.Protocol` plus three
implementations (:class:`FakeLLMClient`, :class:`OpenAIChatClient`,
:class:`AnthropicChatClient`) and a :func:`build_llm_client` factory that
picks the right one from an :class:`~dex_ai_trader.config.LLMConfig`.

The optional ``openai`` and ``anthropic`` SDKs are imported lazily inside the
concrete client constructors. Importing this package without those extras
installed succeeds.
"""

from __future__ import annotations

import importlib.util
import os
from typing import TYPE_CHECKING

from .anthropic_client import AnthropicChatClient
from .base import (
    ChatMessage,
    LLMClient,
    LLMConfigError,
    LLMError,
    extract_json,
    validate_against_schema,
)
from .fake import FakeLLMClient
from .openai_client import OpenAIChatClient

if TYPE_CHECKING:
    from ..config import LLMConfig
    from ..credentials import CredentialStore


def build_llm_client(
    config: LLMConfig,
    credentials: CredentialStore | None = None,
) -> LLMClient:
    """Construct the right :class:`LLMClient` for ``config.provider``.

    * ``provider='fake'`` returns a :class:`FakeLLMClient` that always emits
      the empty dict. Tests should construct ``FakeLLMClient`` directly with
      a richer script.
    * ``provider='openai'`` and ``provider='anthropic'`` look up the API key
      first in the ``CredentialStore`` (using the provider name as the venue)
      and fall back to the environment variables ``OPENAI_API_KEY`` /
      ``ANTHROPIC_API_KEY``. They raise :class:`LLMConfigError` with the
      exact ``uv sync --extra <name>`` command if the SDK is missing.
    """
    provider = config.provider

    if provider == "fake":
        return FakeLLMClient.always({})

    if provider == "openai":
        if importlib.util.find_spec("openai") is None:
            raise LLMConfigError(
                "openai SDK is not installed; run 'uv sync --extra openai' to enable "
                "the openai LLM provider"
            )
        api_key = _api_key_for(provider, credentials, env_var="OPENAI_API_KEY")
        return OpenAIChatClient(
            model=config.model,
            api_key=api_key,
            base_url=config.base_url,
            temperature=config.temperature,
        )

    if provider == "anthropic":
        if importlib.util.find_spec("anthropic") is None:
            raise LLMConfigError(
                "anthropic SDK is not installed; run 'uv sync --extra anthropic' to "
                "enable the anthropic LLM provider"
            )
        api_key = _api_key_for(provider, credentials, env_var="ANTHROPIC_API_KEY")
        return AnthropicChatClient(
            model=config.model,
            api_key=api_key,
            temperature=config.temperature,
        )

    raise LLMConfigError(f"unknown LLM provider: {provider!r}")


def _api_key_for(
    provider: str,
    credentials: CredentialStore | None,
    *,
    env_var: str,
) -> str:
    """Resolve the api_key for ``provider`` from credentials or the environment."""
    if credentials is not None and credentials.is_unlocked():
        record = credentials.get(provider)
        if record is not None and record.api_key:
            return record.api_key
    env_value = os.environ.get(env_var)
    if env_value:
        return env_value
    raise LLMConfigError(
        f"no api_key for provider {provider!r}; set {env_var} or store a credential "
        f"under venue={provider!r}"
    )


__all__ = [
    "AnthropicChatClient",
    "ChatMessage",
    "FakeLLMClient",
    "LLMClient",
    "LLMConfigError",
    "LLMError",
    "OpenAIChatClient",
    "build_llm_client",
    "extract_json",
    "validate_against_schema",
]
