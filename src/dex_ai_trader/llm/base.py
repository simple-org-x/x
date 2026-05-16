"""Provider-agnostic LLM client protocol and shared helpers.

Every concrete client implementation (``FakeLLMClient``, ``OpenAIChatClient``,
``AnthropicChatClient``) satisfies the :class:`LLMClient` Protocol defined
here. Agents type-annotate against ``LLMClient`` so the orchestrator can swap
in any provider (or a deterministic fake) without code changes.

The optional SDKs (``openai``, ``anthropic``) are imported lazily inside the
concrete client constructors. Importing this module never touches them.
"""

from __future__ import annotations

import json
import re
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict

Role = Literal["system", "user", "assistant"]


class ChatMessage(BaseModel):
    """A single chat-style message passed to ``LLMClient.generate``."""

    model_config = ConfigDict(extra="forbid")

    role: Role
    content: str


class LLMError(RuntimeError):
    """Raised by every concrete client when generation fails.

    Wraps lower-level SDK errors so callers never have to import
    ``openai`` or ``anthropic`` to handle failures. Implementations must
    ensure the wrapped message never contains the API key.
    """


class LLMConfigError(RuntimeError):
    """Raised by :func:`build_llm_client` for misconfiguration.

    Includes the case where the optional SDK for the chosen provider is not
    installed. The message is required to contain the exact
    ``uv sync --extra <name>`` command the user should run.
    """


class LLMClient(Protocol):
    """Async LLM interface used by agents.

    Implementations return the parsed JSON object the agent asked for. The
    ``response_schema`` is a JSON Schema dict the implementation should pass
    through to the provider's structured-output mechanism (or use to validate
    the parsed reply).
    """

    async def generate(
        self,
        messages: list[ChatMessage],
        response_schema: dict[str, Any],
        *,
        max_tokens: int = 1024,
    ) -> dict[str, Any]: ...


# -- helpers --------------------------------------------------------------

_FENCED_JSON = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL | re.IGNORECASE)


def extract_json(text: str) -> dict[str, Any]:
    """Pull a JSON object out of free-form model text.

    Tries, in order:

    1. The first fenced ``json`` (or unlabeled) code block.
    2. The first balanced ``{...}`` span.

    Raises ``LLMError`` if neither yields valid JSON or the result is not an
    object. Used by adapters whose providers do not natively support
    structured output.
    """
    fenced = _FENCED_JSON.search(text)
    if fenced is not None:
        candidate = fenced.group(1).strip()
        try:
            value = json.loads(candidate)
        except json.JSONDecodeError as exc:
            raise LLMError(f"fenced JSON block is not valid JSON: {exc.msg}") from exc
        if not isinstance(value, dict):
            raise LLMError("fenced JSON block did not contain a JSON object")
        return value

    start = text.find("{")
    if start < 0:
        raise LLMError("no JSON object found in text")
    depth = 0
    for idx in range(start, len(text)):
        ch = text[idx]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                span = text[start : idx + 1]
                try:
                    value = json.loads(span)
                except json.JSONDecodeError as exc:
                    raise LLMError(f"balanced JSON span is not valid JSON: {exc.msg}") from exc
                if not isinstance(value, dict):
                    raise LLMError("balanced JSON span did not contain a JSON object")
                return value
    raise LLMError("no balanced JSON object found in text")


def validate_against_schema(value: dict[str, Any], schema: dict[str, Any]) -> None:
    """Validate ``value`` against ``schema``.

    Uses ``jsonschema`` if installed; otherwise falls back to a best-effort
    check that every name in ``schema['required']`` is present as a top-level
    key. Raises :class:`LLMError` on failure.
    """
    try:
        import jsonschema
    except ImportError:
        required = schema.get("required") or []
        for key in required:
            if key not in value:
                raise LLMError(
                    f"response missing required key {key!r} "
                    "(schema check, jsonschema not installed)"
                ) from None
        return

    try:
        jsonschema.validate(value, schema)
    except jsonschema.ValidationError as exc:
        raise LLMError(f"response failed JSON schema validation: {exc.message}") from exc


__all__ = [
    "ChatMessage",
    "LLMClient",
    "LLMError",
    "LLMConfigError",
    "Role",
    "extract_json",
    "validate_against_schema",
]
