"""Shared pytest fixtures for the dex-ai-trader test suite."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest

from dex_ai_trader.config import (
    AppConfig,
    CredentialsConfig,
    LLMConfig,
    RiskConfig,
    RunConfig,
    VenueConfig,
)


@pytest.fixture
def tmp_home(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """Point HOME at a tmp_path so default credential/audit paths land there."""
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    return tmp_path


@pytest.fixture
def fake_clock(monkeypatch: pytest.MonkeyPatch) -> Iterator[datetime]:
    """Pin datetime.now to a fixed point for deterministic tests."""
    fixed = datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC)

    class _FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz: object = None) -> datetime:  # type: ignore[override]
            return fixed if tz is None else fixed.astimezone(tz)  # type: ignore[arg-type]

    monkeypatch.setattr("dex_ai_trader.audit.datetime", _FrozenDatetime)
    yield fixed


@pytest.fixture
def sample_config() -> AppConfig:
    """An in-memory AppConfig with venue=paper and conservative risk limits."""
    return AppConfig(
        llm=LLMConfig(provider="fake", model="fake-model"),
        venue=VenueConfig(name="paper", testnet=True),
        risk=RiskConfig(
            max_notional_usd=1000.0,
            max_leverage=3.0,
            symbol_allowlist=["BTC-USD", "ETH-USD"],
            daily_loss_cap_usd=200.0,
            min_confidence=0.55,
        ),
        run=RunConfig(symbols=["BTC-USD"], dry_run=True, live=False),
        credentials=CredentialsConfig(live=False),
    )
