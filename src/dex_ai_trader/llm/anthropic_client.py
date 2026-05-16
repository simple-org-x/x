"""Anthropic Messages backend for ``LLMClient``.

The ``anthropic`` SDK is imported lazily inside
:meth:`AnthropicChatClient.__init__` so importing :mod:`dex_ai_trader.llm`
succeeds without the optional extra. To install the SDK run::

    uv sync --extra anthropic

Structured output is forced via Anthropic's tool-use mechanism: a single
synthetic tool ``emit_decision`` whose ``input_schema`` is the caller-supplied
JSON schema, with ``tool_choice`` pinned to that tool. The tool-use input is
returned directly as the parsed dict.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from .base import ChatMessage, LLMError, validate_against_schema

if TYPE_CHECKING:  # pragma: no cover - type hints only
    from anthropic import Anthropic


TOOL_NAME = "emit_decision"


class AnthropicChatClient:
    """Async-compatible wrapper around ``anthropic.Anthropic``.

    The SDK is synchronous; blocking calls are dispatched via
    :func:`asyncio.to_thread`.
    """

    def __init__(
        self,
        *,
        model: str,
        api_key: str,
        temperature: float = 0.2,
        client: Anthropic | None = None,
    ) -> None:
        self._model = model
        self._temperature = temperature
        self.__api_key = api_key

        if client is None:
            try:
                from anthropic import Anthropic as _Anthropic  # noqa: N814
            except ImportError as exc:  # pragma: no cover - defensive
                raise LLMError(
                    "anthropic SDK not installed; run 'uv sync --extra anthropic'"
                ) from exc
            client = _Anthropic(api_key=api_key)

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

        system_text, dialog = _split_system(messages)

        kwargs: dict[str, Any] = {
            "model": self._model,
            "temperature": self._temperature,
            "max_tokens": max_tokens,
            "messages": dialog,
            "tools": [
                {
                    "name": TOOL_NAME,
                    "description": "Emit the agent's structured decision.",
                    "input_schema": response_schema,
                }
            ],
            "tool_choice": {"type": "tool", "name": TOOL_NAME},
        }
        if system_text is not None:
            kwargs["system"] = system_text

        try:
            response = await asyncio.to_thread(lambda: self._client.messages.create(**kwargs))
        except Exception as exc:  # noqa: BLE001 - SDK raises a variety of types
            raise LLMError(self._scrub(str(exc))) from exc

        value = _extract_tool_input(response)
        if not isinstance(value, dict):
            raise LLMError("Anthropic tool_use input was not a JSON object")
        validate_against_schema(value, response_schema)
        return value

    # -- secret hygiene --------------------------------------------------

    def _scrub(self, text: str) -> str:
        if self.__api_key and self.__api_key in text:
            return text.replace(self.__api_key, "***")
        return text

    def __repr__(self) -> str:
        return f"AnthropicChatClient(model={self._model!r}, temperature={self._temperature!r})"

    def __str__(self) -> str:
        return self.__repr__()


def _split_system(
    messages: list[ChatMessage],
) -> tuple[str | None, list[dict[str, str]]]:
    """Split a ChatMessage list into Anthropic's (system, messages) shape.

    Anthropic takes ``system`` as a top-level argument; only ``user`` and
    ``assistant`` roles may appear in the ``messages`` list. Multiple system
    messages are concatenated with blank lines.
    """
    system_parts: list[str] = []
    dialog: list[dict[str, str]] = []
    for msg in messages:
        if msg.role == "system":
            system_parts.append(msg.content)
        else:
            dialog.append({"role": msg.role, "content": msg.content})
    system_text = "\n\n".join(system_parts) if system_parts else None
    return system_text, dialog


def _extract_tool_input(response: Any) -> Any:
    """Pull the ``tool_use`` input out of a Messages API response."""
    content = getattr(response, "content", None)
    if content is None and isinstance(response, dict):
        content = response.get("content")
    if not content:
        raise LLMError("Anthropic response had empty content")
    for block in content:
        block_type = getattr(block, "type", None)
        if block_type is None and isinstance(block, dict):
            block_type = block.get("type")
        if block_type != "tool_use":
            continue
        block_input = getattr(block, "input", None)
        if block_input is None and isinstance(block, dict):
            block_input = block.get("input")
        return block_input
    raise LLMError("Anthropic response contained no tool_use block")


__all__ = ["AnthropicChatClient"]
