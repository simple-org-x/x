"""Tests for AnthropicChatClient.

The real ``anthropic`` SDK is monkeypatched to a fake that records the kwargs;
no network calls are ever made. Skipped cleanly when the optional extra is not
installed.
"""

from __future__ import annotations

from typing import Any

import pytest

pytest.importorskip("anthropic")

import anthropic  # noqa: E402

from dex_ai_trader.llm import AnthropicChatClient, ChatMessage, LLMError  # noqa: E402

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"verdict": {"type": "string"}},
    "required": ["verdict"],
    "additionalProperties": False,
}


class _FakeToolBlock:
    type = "tool_use"

    def __init__(self, payload: dict[str, Any]) -> None:
        self.input = payload


class _FakeResponse:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.content = [_FakeToolBlock(payload)]


class _FakeMessages:
    def __init__(self, response: _FakeResponse | Exception) -> None:
        self._response = response
        self.kwargs: dict[str, Any] | None = None

    def create(self, **kwargs: Any) -> _FakeResponse:
        self.kwargs = kwargs
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


class _FakeAnthropic:
    last_init_kwargs: dict[str, Any] | None = None

    def __init__(self, **kwargs: Any) -> None:
        type(self).last_init_kwargs = kwargs
        self._messages = _FakeMessages(_FakeResponse({"verdict": "approve"}))
        self.messages = self._messages


@pytest.fixture
def patched_anthropic(monkeypatch: pytest.MonkeyPatch) -> type[_FakeAnthropic]:
    monkeypatch.setattr(anthropic, "Anthropic", _FakeAnthropic)
    return _FakeAnthropic


@pytest.mark.asyncio
async def test_passes_model_temperature_and_tool_use(
    patched_anthropic: type[_FakeAnthropic],
) -> None:
    client = AnthropicChatClient(
        model="claude-3-5-sonnet", api_key="anthropic-key", temperature=0.4
    )

    result = await client.generate(
        [
            ChatMessage(role="system", content="be terse"),
            ChatMessage(role="user", content="decide"),
        ],
        SCHEMA,
        max_tokens=256,
    )

    assert result == {"verdict": "approve"}
    assert patched_anthropic.last_init_kwargs == {"api_key": "anthropic-key"}

    create_kwargs = client._client.messages.kwargs  # type: ignore[attr-defined]
    assert create_kwargs is not None
    assert create_kwargs["model"] == "claude-3-5-sonnet"
    assert create_kwargs["temperature"] == 0.4
    assert create_kwargs["max_tokens"] == 256
    assert create_kwargs["system"] == "be terse"
    assert create_kwargs["messages"] == [{"role": "user", "content": "decide"}]
    assert create_kwargs["tools"] == [
        {
            "name": "emit_decision",
            "description": "Emit the agent's structured decision.",
            "input_schema": SCHEMA,
        }
    ]
    assert create_kwargs["tool_choice"] == {
        "type": "tool",
        "name": "emit_decision",
    }


@pytest.mark.asyncio
async def test_omits_system_when_no_system_message(
    patched_anthropic: type[_FakeAnthropic],
) -> None:
    client = AnthropicChatClient(model="claude-3-5-sonnet", api_key="anthropic-key")
    await client.generate([ChatMessage(role="user", content="decide")], SCHEMA)

    create_kwargs = client._client.messages.kwargs  # type: ignore[attr-defined]
    assert create_kwargs is not None
    assert "system" not in create_kwargs


@pytest.mark.asyncio
async def test_returned_tool_input_is_parsed_into_dict(
    patched_anthropic: type[_FakeAnthropic],
) -> None:
    client = AnthropicChatClient(model="claude-3-5-sonnet", api_key="anthropic-key")
    result = await client.generate([ChatMessage(role="user", content="hi")], SCHEMA)
    assert result == {"verdict": "approve"}


@pytest.mark.asyncio
async def test_sdk_exception_becomes_llm_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _BoomAnthropic:
        def __init__(self, **_kwargs: Any) -> None:
            self.messages = _FakeMessages(RuntimeError("boom"))

    monkeypatch.setattr(anthropic, "Anthropic", _BoomAnthropic)
    client = AnthropicChatClient(model="claude-3-5-sonnet", api_key="anthropic-key")
    with pytest.raises(LLMError) as excinfo:
        await client.generate([ChatMessage(role="user", content="hi")], SCHEMA)
    assert "boom" in str(excinfo.value)


@pytest.mark.asyncio
async def test_api_key_is_scrubbed_from_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    api_key = "anthropic-very-secret"

    class _LeakyAnthropic:
        def __init__(self, **_kwargs: Any) -> None:
            self.messages = _FakeMessages(RuntimeError(f"server rejected key={api_key}"))

    monkeypatch.setattr(anthropic, "Anthropic", _LeakyAnthropic)
    client = AnthropicChatClient(model="claude-3-5-sonnet", api_key=api_key)
    with pytest.raises(LLMError) as excinfo:
        await client.generate([ChatMessage(role="user", content="hi")], SCHEMA)
    assert api_key not in str(excinfo.value)


@pytest.mark.asyncio
async def test_response_without_tool_use_block_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _TextOnlyResponse:
        content = [type("B", (), {"type": "text", "text": "no tool"})()]

    class _PatchedAnthropic:
        def __init__(self, **_kwargs: Any) -> None:
            self.messages = _FakeMessages(_TextOnlyResponse())  # type: ignore[arg-type]

    monkeypatch.setattr(anthropic, "Anthropic", _PatchedAnthropic)
    client = AnthropicChatClient(model="claude-3-5-sonnet", api_key="anthropic-key")
    with pytest.raises(LLMError):
        await client.generate([ChatMessage(role="user", content="hi")], SCHEMA)


def test_repr_and_str_never_contain_api_key() -> None:
    client = AnthropicChatClient(model="claude-3-5-sonnet", api_key="anthropic-very-secret-1234")
    assert "anthropic-very-secret-1234" not in repr(client)
    assert "anthropic-very-secret-1234" not in str(client)
    assert "claude-3-5-sonnet" in repr(client)
