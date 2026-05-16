"""OpenAI Chat Completions backend for ``LLMClient``.

The ``openai`` SDK is imported lazily inside :meth:`OpenAIChatClient.__init__`
so importing :mod:`dex_ai_trader.llm` succeeds without the optional extra. To
install the SDK run::

    uv sync --extra openai

The client requests JSON-schema-constrained output via
``response_format={'type':'json_schema', ...}`` when the schema is supplied;
otherwise it falls back to ``{'type':'json_object'}`` and parses the content
with :func:`extract_json`.

Errors from the SDK are wrapped in :class:`LLMError` with the API key
scrubbed; the api_key never appears in :func:`repr` or :func:`str` of a
client instance.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from .base import (
    ChatMessage,
    LLMError,
    extract_json,
    validate_against_schema,
)

if TYPE_CHECKING:  # pragma: no cover - type hints only
    from openai import OpenAI


class OpenAIChatClient:
    """Async-compatible wrapper around ``openai.OpenAI``.

    The SDK exposes a synchronous client; we run blocking calls in a worker
    thread via :func:`asyncio.to_thread` so the overall surface remains
    awaitable.
    """

    def __init__(
        self,
        *,
        model: str,
        api_key: str,
        base_url: str | None = None,
        temperature: float = 0.2,
        client: OpenAI | None = None,
    ) -> None:
        self._model = model
        self._base_url = base_url
        self._temperature = temperature
        # Store the api_key in a private slot so repr/str cannot leak it.
        self.__api_key = api_key

        if client is None:
            try:
                from openai import OpenAI as _OpenAI  # noqa: N814
            except ImportError as exc:  # pragma: no cover - defensive
                raise LLMError("openai SDK not installed; run 'uv sync --extra openai'") from exc
            client_kwargs: dict[str, Any] = {"api_key": api_key}
            if base_url is not None:
                client_kwargs["base_url"] = base_url
            client = _OpenAI(**client_kwargs)

        self._client = client

    # -- LLMClient protocol ----------------------------------------------

    async def generate(
        self,
        messages: list[ChatMessage],
        response_schema: dict[str, Any],
        *,
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        import asyncio

        payload = [{"role": m.role, "content": m.content} for m in messages]
        # Prefer strict JSON-Schema-constrained output when the SDK supports it.
        primary_kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": payload,
            "temperature": self._temperature,
            "max_tokens": max_tokens,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "AgentOutput",
                    "schema": response_schema,
                    "strict": True,
                },
            },
        }
        try:
            response = await asyncio.to_thread(
                lambda: self._client.chat.completions.create(**primary_kwargs)
            )
        except Exception as exc:  # noqa: BLE001 - SDK raises a variety of types
            if _looks_like_unsupported_response_format(exc):
                fallback_kwargs = {
                    **primary_kwargs,
                    "response_format": {"type": "json_object"},
                }
                try:
                    response = await asyncio.to_thread(
                        lambda: self._client.chat.completions.create(**fallback_kwargs)
                    )
                except Exception as exc2:  # noqa: BLE001
                    raise LLMError(self._scrub(str(exc2))) from exc2
            else:
                raise LLMError(self._scrub(str(exc))) from exc

        content = _extract_content(response)
        try:
            value = json.loads(content)
        except json.JSONDecodeError:
            value = extract_json(content)
        if not isinstance(value, dict):
            raise LLMError("OpenAI response did not parse to a JSON object")
        validate_against_schema(value, response_schema)
        return value

    # -- secret hygiene --------------------------------------------------

    def _scrub(self, text: str) -> str:
        if self.__api_key and self.__api_key in text:
            return text.replace(self.__api_key, "***")
        return text

    def __repr__(self) -> str:
        return (
            f"OpenAIChatClient(model={self._model!r}, "
            f"base_url={self._base_url!r}, temperature={self._temperature!r})"
        )

    def __str__(self) -> str:
        return self.__repr__()


def _looks_like_unsupported_response_format(exc: BaseException) -> bool:
    msg = str(exc).lower()
    return "response_format" in msg and (
        "json_schema" in msg or "unsupported" in msg or "invalid" in msg
    )


def _extract_content(response: Any) -> str:
    """Pull the assistant text out of a Chat Completion response.

    The SDK returns a Pydantic-like object; we tolerate either attribute
    access (real SDK) or dict access (fakes used in tests).
    """
    choices = getattr(response, "choices", None)
    if choices is None and isinstance(response, dict):
        choices = response.get("choices")
    if not choices:
        raise LLMError("OpenAI response had no choices")
    first = choices[0]
    message = getattr(first, "message", None)
    if message is None and isinstance(first, dict):
        message = first.get("message")
    if message is None:
        raise LLMError("OpenAI response choice had no message")
    content = getattr(message, "content", None)
    if content is None and isinstance(message, dict):
        content = message.get("content")
    if not isinstance(content, str):
        raise LLMError("OpenAI response message content was not a string")
    return content


__all__ = ["OpenAIChatClient"]
