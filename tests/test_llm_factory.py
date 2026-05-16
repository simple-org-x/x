"""Tests for build_llm_client()."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

from dex_ai_trader.config import LLMConfig
from dex_ai_trader.credentials import CredentialRecord, CredentialStore
from dex_ai_trader.llm import (
    FakeLLMClient,
    LLMConfigError,
    build_llm_client,
)


def test_build_fake_works_with_no_credentials() -> None:
    client = build_llm_client(LLMConfig(provider="fake", model="fake-model"))
    assert isinstance(client, FakeLLMClient)


def test_build_fake_with_credentials_store_works() -> None:
    store = CredentialStore()
    store.unlock("pw")
    client = build_llm_client(LLMConfig(provider="fake", model="fake-model"), store)
    assert isinstance(client, FakeLLMClient)


def test_openai_without_sdk_mentions_uv_sync_extra(monkeypatch: pytest.MonkeyPatch) -> None:
    """When the openai SDK is missing, the factory must tell the user how to install it."""

    real_find_spec = importlib.util.find_spec

    def fake_find_spec(name: str, *args: object, **kwargs: object) -> object:
        if name == "openai":
            return None
        return real_find_spec(name)

    monkeypatch.setattr(importlib.util, "find_spec", fake_find_spec)

    with pytest.raises(LLMConfigError) as excinfo:
        build_llm_client(LLMConfig(provider="openai", model="gpt-4o"))

    msg = str(excinfo.value)
    assert "uv sync --extra openai" in msg


def test_anthropic_without_sdk_mentions_uv_sync_extra(monkeypatch: pytest.MonkeyPatch) -> None:
    real_find_spec = importlib.util.find_spec

    def fake_find_spec(name: str, *args: object, **kwargs: object) -> object:
        if name == "anthropic":
            return None
        return real_find_spec(name)

    monkeypatch.setattr(importlib.util, "find_spec", fake_find_spec)

    with pytest.raises(LLMConfigError) as excinfo:
        build_llm_client(LLMConfig(provider="anthropic", model="claude-3-5-sonnet"))

    msg = str(excinfo.value)
    assert "uv sync --extra anthropic" in msg


def test_openai_without_api_key_raises_config_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(LLMConfigError) as excinfo:
        build_llm_client(LLMConfig(provider="openai", model="gpt-4o"))
    msg = str(excinfo.value)
    assert "OPENAI_API_KEY" in msg


def test_openai_with_env_api_key_constructs_without_network(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pytest.importorskip("openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-do-not-use")
    client = build_llm_client(LLMConfig(provider="openai", model="gpt-4o"))
    # Constructed but no network was touched (we never called .generate()).
    assert client.__class__.__name__ == "OpenAIChatClient"
    # api_key must not appear in repr / str.
    assert "sk-test-do-not-use" not in repr(client)
    assert "sk-test-do-not-use" not in str(client)


def test_openai_with_credential_store_uses_stored_api_key(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    pytest.importorskip("openai")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    store = CredentialStore(store_path=tmp_path / "credentials.enc")
    store.unlock("pw")
    store.put(
        CredentialRecord(venue="openai", api_key="sk-stored-secret"),
        passphrase="pw",
    )
    # Re-unlock to make put-then-get cleaner (put already left it unlocked).
    client = build_llm_client(LLMConfig(provider="openai", model="gpt-4o"), store)
    assert "sk-stored-secret" not in repr(client)


def test_anthropic_with_env_api_key_constructs_without_network(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pytest.importorskip("anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "anthropic-test-key")
    client = build_llm_client(LLMConfig(provider="anthropic", model="claude-3-5-sonnet"))
    assert client.__class__.__name__ == "AnthropicChatClient"
    assert "anthropic-test-key" not in repr(client)
    assert "anthropic-test-key" not in str(client)
