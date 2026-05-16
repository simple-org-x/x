"""Tests for the pure risk-check function."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from dex_ai_trader.models import (
    AgentContext,
    ExecutionReport,
    Position,
    ProposedTrade,
    Ticker,
)
from dex_ai_trader.risk import RiskLimits, check_order


def _limits(**overrides: object) -> RiskLimits:
    base: dict[str, object] = {
        "max_notional_usd": 1000.0,
        "max_leverage": 3.0,
        "symbol_allowlist": ["BTC-USD"],
        "daily_loss_cap_usd": 200.0,
        "min_confidence": 0.55,
    }
    base.update(overrides)
    return RiskLimits.model_validate(base)


def _trade(**overrides: object) -> ProposedTrade:
    base: dict[str, object] = {
        "venue": "paper",
        "symbol": "BTC-USD",
        "side": "buy",
        "order_type": "limit",
        "size": 0.01,
        "limit_price": 50_000.0,
        "rationale": "x",
        "confidence": 0.7,
        "analyst_id": "a",
    }
    base.update(overrides)
    return ProposedTrade.model_validate(base)


def _ctx(**overrides: object) -> AgentContext:
    base: dict[str, object] = {
        "markets": [],
        "tickers": {
            "BTC-USD": Ticker(
                symbol="BTC-USD",
                mid=50_000,
                bid=49_999,
                ask=50_001,
                ts=datetime(2024, 1, 1, tzinfo=UTC),
            ),
        },
        "positions": [],
        "balances": [],
        "history": [],
        "notes": "",
    }
    base.update(overrides)
    return AgentContext.model_validate(base)


def test_happy_path_passes() -> None:
    ok, reason = check_order(_trade(), _ctx(), _limits())
    assert ok, reason


def test_symbol_not_in_allowlist_rejected() -> None:
    ok, reason = check_order(_trade(symbol="ETH-USD"), _ctx(), _limits())
    assert not ok
    assert "allowlist" in reason


def test_notional_cap_rejected() -> None:
    # 1.0 * 50_000 = 50_000 > 1000
    ok, reason = check_order(_trade(size=1.0), _ctx(), _limits())
    assert not ok
    assert "notional" in reason


def test_leverage_cap_rejected() -> None:
    pos = Position(symbol="BTC-USD", size=1.0, entry_price=50_000, unrealized_pnl=0, leverage=10.0)
    ok, reason = check_order(_trade(), _ctx(positions=[pos]), _limits())
    assert not ok
    assert "leverage" in reason


def test_confidence_floor_rejected() -> None:
    ok, reason = check_order(_trade(confidence=0.1), _ctx(), _limits())
    assert not ok
    assert "confidence" in reason


def test_daily_loss_cap_rejected() -> None:
    bad = ExecutionReport(
        decision_id=uuid4(),
        venue="paper",
        status="filled",
        filled_size=-1.0,  # negative size used as a loss-realizing close
        avg_price=300.0,
    )
    ok, reason = check_order(_trade(), _ctx(history=[bad]), _limits())
    assert not ok
    assert "loss cap" in reason


def test_no_reference_price_rejected() -> None:
    ok, reason = check_order(
        _trade(limit_price=None, order_type="market"),
        _ctx(tickers={}),
        _limits(),
    )
    assert not ok
    assert "reference price" in reason
