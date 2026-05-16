"""Tests for OpenAIChatClient.

The real ``openai`` SDK is monkeypatched to a fake that records the kwargs;
no network calls are ever made. The whole module is skipped cleanly when the
``openai`` extra is not installed.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

pytest.importorskip("openai")

import openai  # noqa: E402

from dex_ai_trader.llm import ChatMessage, LLMError, OpenAIChatClient  # noqa: E402

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"verdict": {"type": "string"}},
    "required": ["verdict"],
    "additionalProperties": False,
}


class _FakeMessage:
    def __init__(self, content: str) -> None:
        self.content = content


class _FakeChoice:
    def __init__(self, content: str) -> None:
        self.message = _FakeMessage(content)


class _FakeResponse:
    def __init__(self, content: str) -> None:
        self.choices = [_FakeChoice(content)]


class _FakeChatCompletions:
    def __init__(self, response: _FakeResponse | Exception) -> None:
        self._response = response
        self.kwargs: dict[str, Any] | None = None

    def create(self, **kwargs: Any) -> _FakeResponse:
        self.kwargs = kwargs
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


class _FakeChat:
    def __init__(self, completions: _FakeChatCompletions) -> None:
        self.completions = completions


class _FakeOpenAI:
    last_init_kwargs: dict[str, Any] | None = None

    def __init__(self, **kwargs: Any) -> None:
        type(self).last_init_kwargs = kwargs
        self._completions = _FakeChatCompletions(_FakeResponse(json.dumps({"verdict": "approve"})))
        self.chat = _FakeChat(self._completions)


@pytest.fixture
def patched_openai(monkeypatch: pytest.MonkeyPatch) -> type[_FakeOpenAI]:
    monkeypatch.setattr(openai, "OpenAI", _FakeOpenAI)
    return _FakeOpenAI


@pytest.mark.asyncio
async def test_passes_model_temperature_and_structured_output(
    patched_openai: type[_FakeOpenAI],
) -> None:
    client = OpenAIChatClient(model="gpt-4o", api_key="sk-test", temperature=0.7)

    result = await client.generate([ChatMessage(role="user", content="hi")], SCHEMA, max_tokens=512)

    assert result == {"verdict": "approve"}
    # The init kwargs got the api_key.
    assert patched_openai.last_init_kwargs == {"api_key": "sk-test"}
    # The chat.completions.create call got everything we expect.
    create_kwargs = client._client.chat.completions.kwargs  # type: ignore[attr-defined]
    assert create_kwargs is not None
    assert create_kwargs["model"] == "gpt-4o"
    assert create_kwargs["temperature"] == 0.7
    assert create_kwargs["max_tokens"] == 512
    assert create_kwargs["messages"] == [{"role": "user", "content": "hi"}]
    assert create_kwargs["response_format"] == {
        "type": "json_schema",
        "json_schema": {
            "name": "AgentOutput",
            "schema": SCHEMA,
            "strict": True,
        },
    }


@pytest.mark.asyncio
async def test_passes_base_url_when_configured(
    patched_openai: type[_FakeOpenAI],
) -> None:
    OpenAIChatClient(model="gpt-4o", api_key="sk-test", base_url="https://example.test/v1")
    assert patched_openai.last_init_kwargs == {
        "api_key": "sk-test",
        "base_url": "https://example.test/v1",
    }


@pytest.mark.asyncio
async def test_returned_content_is_parsed_into_dict(
    patched_openai: type[_FakeOpenAI],
) -> None:
    client = OpenAIChatClient(model="gpt-4o", api_key="sk-test")
    result = await client.generate([ChatMessage(role="user", content="hi")], SCHEMA)
    assert result == {"verdict": "approve"}


@pytest.mark.asyncio
async def test_sdk_exception_becomes_llm_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _BoomOpenAI:
        def __init__(self, **_kwargs: Any) -> None:
            self.chat = _FakeChat(_FakeChatCompletions(RuntimeError("boom")))

    monkeypatch.setattr(openai, "OpenAI", _BoomOpenAI)
    client = OpenAIChatClient(model="gpt-4o", api_key="sk-test")
    with pytest.raises(LLMError) as excinfo:
        await client.generate([ChatMessage(role="user", content="hi")], SCHEMA)
    assert "boom" in str(excinfo.value)


@pytest.mark.asyncio
async def test_api_key_is_scrubbed_from_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    api_key = "sk-very-secret"

    class _LeakyOpenAI:
        def __init__(self, **_kwargs: Any) -> None:
            self.chat = _FakeChat(
                _FakeChatCompletions(RuntimeError(f"upstream rejected key={api_key}"))
            )

    monkeypatch.setattr(openai, "OpenAI", _LeakyOpenAI)
    client = OpenAIChatClient(model="gpt-4o", api_key=api_key)
    with pytest.raises(LLMError) as excinfo:
        await client.generate([ChatMessage(role="user", content="hi")], SCHEMA)
    assert api_key not in str(excinfo.value)


@pytest.mark.asyncio
async def test_falls_back_to_json_object_when_schema_unsupported(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If the model rejects ``response_format=json_schema`` the client retries with json_object."""

    seen_kwargs: list[dict[str, Any]] = []

    class _Completions:
        def __init__(self) -> None:
            self.calls = 0

        def create(self, **kwargs: Any) -> _FakeResponse:
            self.calls += 1
            seen_kwargs.append(kwargs)
            if self.calls == 1:
                raise ValueError("Invalid response_format type: 'json_schema' is not supported")
            return _FakeResponse(json.dumps({"verdict": "approve"}))

    class _PatchedOpenAI:
        def __init__(self, **_kwargs: Any) -> None:
            self.chat = _FakeChat(_Completions())  # type: ignore[arg-type]

    monkeypatch.setattr(openai, "OpenAI", _PatchedOpenAI)

    client = OpenAIChatClient(model="gpt-4o", api_key="sk-test")
    result = await client.generate([ChatMessage(role="user", content="hi")], SCHEMA)

    assert result == {"verdict": "approve"}
    assert len(seen_kwargs) == 2
    assert seen_kwargs[0]["response_format"]["type"] == "json_schema"
    assert seen_kwargs[1]["response_format"] == {"type": "json_object"}


def test_repr_and_str_never_contain_api_key() -> None:
    client = OpenAIChatClient(model="gpt-4o", api_key="sk-very-secret-1234")
    assert "sk-very-secret-1234" not in repr(client)
    assert "sk-very-secret-1234" not in str(client)
    # Sanity: model is shown.
    assert "gpt-4o" in repr(client)
