"""Deterministic, scriptable LLM client used for tests and dry-run demos.

``FakeLLMClient`` is the default LLM in the test suite and in
``provider='fake'`` mode. It never imports any optional SDKs and performs no
I/O; calls return one of:

* The next entry from a scripted list of dicts.
* The result of a callable invoked with ``(messages, response_schema)``.
* The constant value passed to :meth:`FakeLLMClient.always`.

Returned dicts are validated against the supplied ``response_schema`` via
:func:`dex_ai_trader.llm.base.validate_against_schema`.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from .base import ChatMessage, LLMError, validate_against_schema

ResponseFn = Callable[[list[ChatMessage], dict[str, Any]], dict[str, Any]]


class FakeLLMClient:
    """Scripted, deterministic LLM client.

    Construct with either a list of pre-baked response dicts or a callable
    that builds the response from the messages + schema at call time. The
    convenience constructors :meth:`always` and :meth:`from_sequence` cover
    the common cases.
    """

    def __init__(
        self,
        scripted: list[dict[str, Any]] | ResponseFn,
    ) -> None:
        if callable(scripted):
            self._fn: ResponseFn | None = scripted
            self._scripted: list[dict[str, Any]] | None = None
        else:
            self._fn = None
            # Copy so callers mutating the source list cannot affect us.
            self._scripted = list(scripted)
        self._index = 0

    # -- convenience constructors -----------------------------------------

    @classmethod
    def always(cls, value: dict[str, Any]) -> FakeLLMClient:
        """Return a client whose every call yields ``value`` (a fresh copy)."""

        def _fn(_messages: list[ChatMessage], _schema: dict[str, Any]) -> dict[str, Any]:
            return dict(value)

        return cls(_fn)

    @classmethod
    def from_sequence(cls, values: list[dict[str, Any]]) -> FakeLLMClient:
        """Return a client that yields ``values`` in order, then raises on overflow."""
        return cls(list(values))

    # -- LLMClient protocol ----------------------------------------------

    async def generate(
        self,
        messages: list[ChatMessage],
        response_schema: dict[str, Any],
        *,
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        if self._fn is not None:
            value = self._fn(messages, response_schema)
        else:
            assert self._scripted is not None  # for type checkers
            if self._index >= len(self._scripted):
                raise LLMError(
                    f"FakeLLMClient script exhausted after {self._index} call(s); "
                    f"add more entries or use FakeLLMClient.always(...)"
                )
            value = dict(self._scripted[self._index])
            self._index += 1

        if not isinstance(value, dict):
            raise LLMError(f"FakeLLMClient produced a non-dict response: {type(value).__name__}")
        validate_against_schema(value, response_schema)
        return value

    # -- introspection ----------------------------------------------------

    @property
    def calls_remaining(self) -> int | None:
        """Remaining scripted entries, or ``None`` if backed by a callable."""
        if self._scripted is None:
            return None
        return max(0, len(self._scripted) - self._index)

    def __repr__(self) -> str:
        if self._fn is not None:
            return "FakeLLMClient(callable)"
        assert self._scripted is not None
        return f"FakeLLMClient(scripted={len(self._scripted)}, index={self._index})"


__all__ = ["FakeLLMClient", "ResponseFn"]
