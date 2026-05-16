"""Tests for the in-memory PaperAdapter."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from dex_ai_trader.dex.paper import PaperAdapter
from dex_ai_trader.models import ApprovedOrder, ProposedTrade


def _market_buy(symbol: str, size: float, *, limit_price: float | None = None) -> ApprovedOrder:
    trade = ProposedTrade(
        venue="paper",
        symbol=symbol,
        side="buy",
        order_type="market" if limit_price is None else "limit",
        size=size,
        limit_price=limit_price,
        rationale="test",
        confidence=0.9,
        analyst_id="t",
    )
    return ApprovedOrder(
        trade=trade,
        decision_id=uuid4(),
        approved_at=datetime.now(tz=UTC),
        responsible_id="r",
        signature="sig",
    )


def _market_sell(symbol: str, size: float) -> ApprovedOrder:
    trade = ProposedTrade(
        venue="paper",
        symbol=symbol,
        side="sell",
        order_type="market",
        size=size,
        limit_price=None,
        rationale="test",
        confidence=0.9,
        analyst_id="t",
    )
    return ApprovedOrder(
        trade=trade,
        decision_id=uuid4(),
        approved_at=datetime.now(tz=UTC),
        responsible_id="r",
        signature="sig",
    )


@pytest.mark.asyncio
async def test_market_buy_updates_balance_and_position() -> None:
    adapter = PaperAdapter(initial_cash=10_000.0, mark_price=lambda _s: 100.0)

    report = await adapter.place_order(_market_buy("BTC-USD", 1.0))

    assert report.status == "paper"
    assert report.filled_size == 1.0
    assert report.avg_price == 100.0

    balances = {b.asset: b for b in await adapter.get_balances()}
    assert balances["USDC"].total == pytest.approx(9_900.0)

    positions = await adapter.get_positions()
    assert len(positions) == 1
    assert positions[0].symbol == "BTC-USD"
    assert positions[0].size == pytest.approx(1.0)
    assert positions[0].entry_price == pytest.approx(100.0)


@pytest.mark.asyncio
async def test_limit_buy_does_not_cross_is_recorded_as_submitted() -> None:
    adapter = PaperAdapter(mark_price=lambda _s: 100.0)

    report = await adapter.place_order(_market_buy("BTC-USD", 1.0, limit_price=90.0))

    assert report.status == "submitted"
    assert report.filled_size == 0.0
    assert report.exchange_order_id is not None

    open_orders = await adapter.get_open_orders()
    assert len(open_orders) == 1
    assert open_orders[0]["symbol"] == "BTC-USD"
    assert open_orders[0]["limit_price"] == 90.0
    assert open_orders[0]["exchange_order_id"] == report.exchange_order_id

    # No position taken.
    assert await adapter.get_positions() == []


@pytest.mark.asyncio
async def test_sell_closes_position_and_records_pnl() -> None:
    prices = iter([100.0, 110.0])
    adapter = PaperAdapter(initial_cash=10_000.0, mark_price=lambda _s: next(prices))

    await adapter.place_order(_market_buy("BTC-USD", 1.0))
    report = await adapter.place_order(_market_sell("BTC-USD", 1.0))

    assert report.status == "paper"
    assert report.avg_price == pytest.approx(110.0)
    assert await adapter.get_positions() == []

    balances = {b.asset: b for b in await adapter.get_balances()}
    # Bought at 100, sold at 110 -> net cash 10_010, realized pnl 10.
    assert balances["USDC"].total == pytest.approx(10_010.0)
    assert adapter.realized_pnl == pytest.approx(10.0)


@pytest.mark.asyncio
async def test_cancel_open_order() -> None:
    adapter = PaperAdapter(mark_price=lambda _s: 100.0)
    report = await adapter.place_order(_market_buy("BTC-USD", 1.0, limit_price=90.0))
    assert report.exchange_order_id is not None

    cancelled = await adapter.cancel_order("BTC-USD", report.exchange_order_id)
    assert cancelled is True
    assert await adapter.get_open_orders() == []

    cancelled_again = await adapter.cancel_order("BTC-USD", report.exchange_order_id)
    assert cancelled_again is False
