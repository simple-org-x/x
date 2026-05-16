"""Round-trip serialize/deserialize each Pydantic model."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from dex_ai_trader.models import (
    AgentContext,
    ApprovedOrder,
    Balance,
    ExecutionReport,
    Market,
    Position,
    ProposedTrade,
    ReviewedTrade,
    Ticker,
)


def _proposed() -> ProposedTrade:
    return ProposedTrade(
        venue="paper",
        symbol="BTC-USD",
        side="buy",
        order_type="limit",
        size=0.1,
        limit_price=50_000.0,
        rationale="trend up",
        confidence=0.7,
        analyst_id="analyst-1",
    )


def test_market_round_trip() -> None:
    m = Market(
        symbol="BTC-USD", base="BTC", quote="USD", venue="paper", min_size=0.001, price_precision=2
    )
    assert Market.model_validate(m.model_dump()) == m


def test_ticker_round_trip() -> None:
    t = Ticker(
        symbol="BTC-USD", mid=50_000, bid=49_999, ask=50_001, ts=datetime(2024, 1, 1, tzinfo=UTC)
    )
    assert Ticker.model_validate(t.model_dump()) == t


def test_position_round_trip() -> None:
    p = Position(
        symbol="BTC-USD", size=1.0, entry_price=50_000.0, unrealized_pnl=10.0, leverage=2.0
    )
    assert Position.model_validate(p.model_dump()) == p


def test_balance_round_trip() -> None:
    b = Balance(asset="USDC", total=1000.0, available=900.0)
    assert Balance.model_validate(b.model_dump()) == b


def test_proposed_trade_round_trip() -> None:
    p = _proposed()
    assert ProposedTrade.model_validate(p.model_dump()) == p


def test_proposed_trade_confidence_bounds() -> None:
    with pytest.raises(ValidationError):
        ProposedTrade(
            venue="paper",
            symbol="BTC-USD",
            side="buy",
            order_type="market",
            size=0.1,
            rationale="x",
            confidence=1.5,
            analyst_id="a",
        )


def test_reviewed_trade_round_trip() -> None:
    r = ReviewedTrade(
        proposed=_proposed(),
        verdict="approve",
        critique="ok",
        amended=None,
        reviewer_id="reviewer-1",
    )
    assert ReviewedTrade.model_validate(r.model_dump()) == r


def test_approved_order_round_trip() -> None:
    a = ApprovedOrder(
        trade=_proposed(),
        decision_id=uuid4(),
        approved_at=datetime(2024, 1, 1, tzinfo=UTC),
        responsible_id="r-1",
        signature="sig",
    )
    assert ApprovedOrder.model_validate(a.model_dump()) == a


def test_execution_report_round_trip() -> None:
    e = ExecutionReport(
        decision_id=uuid4(),
        venue="paper",
        status="paper",
        filled_size=0.1,
        avg_price=50_000.0,
    )
    assert ExecutionReport.model_validate(e.model_dump()) == e


def test_agent_context_round_trip() -> None:
    ctx = AgentContext(
        markets=[
            Market(
                symbol="BTC-USD",
                base="BTC",
                quote="USD",
                venue="paper",
                min_size=0.001,
                price_precision=2,
            )
        ],
        tickers={
            "BTC-USD": Ticker(
                symbol="BTC-USD",
                mid=50_000,
                bid=49_999,
                ask=50_001,
                ts=datetime(2024, 1, 1, tzinfo=UTC),
            )
        },
        positions=[],
        balances=[Balance(asset="USDC", total=1000, available=1000)],
        history=[],
        notes="hello",
    )
    assert AgentContext.model_validate(ctx.model_dump()) == ctx
