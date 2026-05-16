"""Tests for build_adapter()."""

from __future__ import annotations

import pytest

from dex_ai_trader.config import VenueConfig
from dex_ai_trader.credentials import CredentialRecord
from dex_ai_trader.dex import (
    AsterDexAdapter,
    HyperliquidAdapter,
    PaperAdapter,
    build_adapter,
)


def test_paper_does_not_require_credentials() -> None:
    adapter = build_adapter("paper", VenueConfig(name="paper"))
    assert isinstance(adapter, PaperAdapter)
    assert adapter.name == "paper"


def test_paper_accepts_none_config() -> None:
    adapter = build_adapter("paper")
    assert isinstance(adapter, PaperAdapter)


def test_asterdex_missing_credentials_lists_missing_fields() -> None:
    with pytest.raises(ValueError) as excinfo:
        build_adapter("asterdex", VenueConfig(name="asterdex"))
    msg = str(excinfo.value)
    assert "api_key" in msg
    assert "api_secret" in msg


def test_asterdex_partial_credentials_lists_missing_field() -> None:
    creds = CredentialRecord(venue="asterdex", api_key="k")
    with pytest.raises(ValueError) as excinfo:
        build_adapter("asterdex", VenueConfig(name="asterdex"), credentials=creds)
    assert "api_secret" in str(excinfo.value)
    assert "api_key" not in str(excinfo.value)


@pytest.mark.asyncio
async def test_asterdex_with_credentials_returns_adapter() -> None:
    creds = CredentialRecord(venue="asterdex", api_key="k", api_secret="s")
    adapter = build_adapter("asterdex", VenueConfig(name="asterdex"), credentials=creds)
    assert isinstance(adapter, AsterDexAdapter)
    assert adapter.name == "asterdex"
    await adapter.close()


def test_hyperliquid_missing_credentials_lists_missing_fields() -> None:
    with pytest.raises(ValueError) as excinfo:
        build_adapter("hyperliquid", VenueConfig(name="hyperliquid"))
    msg = str(excinfo.value)
    assert "wallet_address" in msg
    assert "private_key" in msg


def test_hyperliquid_missing_private_key_only() -> None:
    creds = CredentialRecord(venue="hyperliquid", wallet_address="0xabc")
    with pytest.raises(ValueError) as excinfo:
        build_adapter("hyperliquid", VenueConfig(name="hyperliquid"), credentials=creds)
    assert "private_key" in str(excinfo.value)
    assert "wallet_address" not in str(excinfo.value)


def test_unknown_venue_raises_clear_error() -> None:
    with pytest.raises(ValueError) as excinfo:
        build_adapter("unknown_venue")
    assert "unknown_venue" in str(excinfo.value)
    assert "paper" in str(excinfo.value)


def test_hyperliquid_factory_does_not_construct_when_extra_missing() -> None:
    """If hyperliquid is installed, the adapter is constructible via the factory.

    We use a private key that ``eth_account`` will accept as a valid 32-byte hex.
    """
    pytest.importorskip("hyperliquid")
    creds = CredentialRecord(
        venue="hyperliquid",
        wallet_address="0x" + "00" * 19 + "01",
        private_key="0x" + "11" * 32,
    )
    adapter = build_adapter(
        "hyperliquid", VenueConfig(name="hyperliquid", testnet=True), credentials=creds
    )
    assert isinstance(adapter, HyperliquidAdapter)
