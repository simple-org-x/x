"""Tests for FakeLLMClient."""

from __future__ import annotations

from typing import Any

import pytest

from dex_ai_trader.llm import ChatMessage, FakeLLMClient, LLMError

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"verdict": {"type": "string"}},
    "required": ["verdict"],
}


@pytest.mark.asyncio
async def test_scripted_returns_each_value_in_order() -> None:
    client = FakeLLMClient.from_sequence(
        [
            {"verdict": "approve"},
            {"verdict": "reject"},
        ]
    )

    first = await client.generate([ChatMessage(role="user", content="hi")], SCHEMA)
    second = await client.generate([ChatMessage(role="user", content="hi")], SCHEMA)

    assert first == {"verdict": "approve"}
    assert second == {"verdict": "reject"}
    assert client.calls_remaining == 0


@pytest.mark.asyncio
async def test_scripted_raises_on_overflow() -> None:
    client = FakeLLMClient.from_sequence([{"verdict": "approve"}])
    await client.generate([ChatMessage(role="user", content="hi")], SCHEMA)

    with pytest.raises(LLMError) as excinfo:
        await client.generate([ChatMessage(role="user", content="hi")], SCHEMA)

    assert "exhausted" in str(excinfo.value)


@pytest.mark.asyncio
async def test_callable_form_receives_messages_and_schema() -> None:
    seen: dict[str, Any] = {}

    def fn(messages: list[ChatMessage], schema: dict[str, Any]) -> dict[str, Any]:
        seen["messages"] = messages
        seen["schema"] = schema
        return {"verdict": "approve"}

    client = FakeLLMClient(fn)
    msgs = [ChatMessage(role="user", content="hi")]

    result = await client.generate(msgs, SCHEMA)

    assert result == {"verdict": "approve"}
    assert seen["messages"] == msgs
    assert seen["schema"] is SCHEMA
    # Callable form has no scripted count.
    assert client.calls_remaining is None


@pytest.mark.asyncio
async def test_always_repeats_indefinitely() -> None:
    client = FakeLLMClient.always({"verdict": "approve"})

    for _ in range(5):
        result = await client.generate([ChatMessage(role="user", content="hi")], SCHEMA)
        assert result == {"verdict": "approve"}


@pytest.mark.asyncio
async def test_validates_against_required_keys() -> None:
    client = FakeLLMClient.always({"not_verdict": "approve"})

    with pytest.raises(LLMError):
        await client.generate([ChatMessage(role="user", content="hi")], SCHEMA)


@pytest.mark.asyncio
async def test_returned_dict_is_a_copy() -> None:
    """Mutating one returned value must not affect later returned values."""
    template = {"verdict": "approve"}
    client = FakeLLMClient.always(template)

    first = await client.generate([ChatMessage(role="user", content="hi")], SCHEMA)
    first["verdict"] = "rejected"
    second = await client.generate([ChatMessage(role="user", content="hi")], SCHEMA)

    assert second == {"verdict": "approve"}
    assert template == {"verdict": "approve"}
