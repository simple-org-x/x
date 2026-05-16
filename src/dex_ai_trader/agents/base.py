"""Shared base class for every agent.

Each agent receives the same dependencies via the constructor and exposes a
single async ``run`` method. The :meth:`Agent._ask_llm` helper centralises the
prompt -> generate -> validate -> Pydantic-parse loop with a single retry on
validation failure (the validation error is appended to the user prompt for
the retry, exactly as a human reviewer would do).
"""

from __future__ import annotations

import logging
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from ..llm.base import ChatMessage, LLMClient, LLMError

T = TypeVar("T", bound=BaseModel)


class AgentError(RuntimeError):
    """Raised when an agent fails to produce a valid output."""


class Agent:
    """Base class with a shared LLM-call helper.

    Subclasses set ``name`` and override ``run``. The ``model`` parameter is
    the human-readable model name used to build agent IDs like
    ``analyst:gpt-4o-mini``.
    """

    name: str = "agent"

    def __init__(
        self,
        *,
        llm: LLMClient,
        model: str = "fake-model",
        logger: logging.Logger | None = None,
    ) -> None:
        self.llm = llm
        self.model = model
        self.logger = logger if logger is not None else logging.getLogger(f"agent.{self.name}")

    @property
    def agent_id(self) -> str:
        """Identifier of the form ``"<name>:<model>"`` recorded on outputs."""
        return f"{self.name}:{self.model}"

    async def _ask_llm(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        schema: dict[str, Any],
        output_model: type[T],
        max_tokens: int = 1024,
    ) -> T:
        """Call the LLM, validate against ``schema`` + ``output_model``.

        On the first parse/validation failure the validation error is appended
        to the user prompt and the LLM is asked once more (single retry).
        """
        messages: list[ChatMessage] = [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=user_prompt),
        ]

        first_error: Exception | None = None
        try:
            raw = await self.llm.generate(messages, schema, max_tokens=max_tokens)
            return output_model.model_validate(raw)
        except (ValidationError, LLMError) as exc:
            first_error = exc
            self.logger.debug("%s first attempt failed validation: %s", self.name, exc)

        retry_messages: list[ChatMessage] = [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(
                role="user",
                content=(
                    f"{user_prompt}\n\n"
                    "Your previous response failed validation with this error:\n"
                    f"{first_error}\n"
                    "Please return a corrected JSON object that matches the schema."
                ),
            ),
        ]
        try:
            raw = await self.llm.generate(retry_messages, schema, max_tokens=max_tokens)
            return output_model.model_validate(raw)
        except (ValidationError, LLMError) as exc:
            raise AgentError(
                f"{self.name}: LLM output failed validation twice ({type(exc).__name__}: {exc})"
            ) from exc


__all__ = ["Agent", "AgentError"]
