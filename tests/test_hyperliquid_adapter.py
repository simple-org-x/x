"""Tests for the Hyperliquid adapter.

Skipped cleanly when the optional ``hyperliquid`` extra is not installed.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

pytest.importorskip("hyperliquid")

from dex_ai_trader.dex.hyperliquid_adapter import HyperliquidAdapter  # noqa: E402
from dex_ai_trader.models import ApprovedOrder, ProposedTrade  # noqa: E402

WALLET = "0x0000000000000000000000000000000000000001"


def _approved(side: str = "buy", order_type: str = "limit") -> ApprovedOrder:
    trade = ProposedTrade(
        venue="hyperliquid",
        symbol="ETH",
        side=side,  # type: ignore[arg-type]
        order_type=order_type,  # type: ignore[arg-type]
        size=0.5,
        limit_price=2000.0 if order_type == "limit" else None,
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


def _make_adapter(*, info: Any, exchange: Any) -> HyperliquidAdapter:
    # Pass info+exchange so the lazy SDK init is bypassed entirely.
    return HyperliquidAdapter(
        wallet_address=WALLET,
        api_wallet_private_key="0x" + "11" * 32,
        testnet=True,
        info=info,
        exchange=exchange,
    )


@pytest.mark.asyncio
async def test_get_positions_parses_user_state() -> None:
    info = MagicMock()
    info.user_state.return_value = {
        "marginSummary": {"accountValue": "1000.0"},
        "withdrawable": "950.0",
        "assetPositions": [
            {
                "position": {
                    "coin": "ETH",
                    "szi": "1.5",
                    "entryPx": "2000.0",
                    "unrealizedPnl": "50.0",
                    "leverage": {"value": "5"},
                }
            },
            {
                "position": {
                    "coin": "BTC",
                    "szi": "0.0",
                    "entryPx": "0.0",
                    "unrealizedPnl": "0.0",
                }
            },
        ],
    }

    adapter = _make_adapter(info=info, exchange=MagicMock())
    positions = await adapter.get_positions()

    assert len(positions) == 1
    assert positions[0].symbol == "ETH"
    assert positions[0].size == 1.5
    assert positions[0].entry_price == 2000.0
    assert positions[0].leverage == 5.0
    info.user_state.assert_called_with(WALLET)


@pytest.mark.asyncio
async def test_place_order_calls_exchange_with_expected_kwargs() -> None:
    exchange = MagicMock()
    exchange.order.return_value = {
        "status": "ok",
        "response": {
            "type": "order",
            "data": {"statuses": [{"resting": {"oid": 12345}}]},
        },
    }

    adapter = _make_adapter(info=MagicMock(), exchange=exchange)
    approved = _approved(order_type="limit")
    report = await adapter.place_order(approved)

    args, _kwargs = exchange.order.call_args
    # Adapter passes positional args matching SDK signature
    # (name, is_buy, sz, limit_px, order_type, reduce_only).
    assert args[0] == "ETH"
    assert args[1] is True  # is_buy for "buy"
    assert args[2] == pytest.approx(0.5)
    assert args[3] == pytest.approx(2000.0)
    assert args[4] == {"limit": {"tif": "Gtc"}}
    assert args[5] is False

    assert report.status == "submitted"
    assert report.exchange_order_id == "12345"


@pytest.mark.asyncio
async def test_place_order_filled_response_returns_filled() -> None:
    exchange = MagicMock()
    exchange.order.return_value = {
        "status": "ok",
        "response": {
            "type": "order",
            "data": {
                "statuses": [
                    {
                        "filled": {
                            "totalSz": "0.5",
                            "avgPx": "1999.5",
                            "oid": 7777,
                        }
                    }
                ]
            },
        },
    }

    adapter = _make_adapter(info=MagicMock(), exchange=exchange)
    report = await adapter.place_order(_approved(order_type="limit"))

    assert report.status == "filled"
    assert report.filled_size == pytest.approx(0.5)
    assert report.avg_price == pytest.approx(1999.5)
    assert report.exchange_order_id == "7777"


@pytest.mark.asyncio
async def test_place_order_rejected_response_becomes_rejected() -> None:
    exchange = MagicMock()
    exchange.order.return_value = {
        "status": "err",
        "response": "Insufficient margin",
    }

    adapter = _make_adapter(info=MagicMock(), exchange=exchange)
    report = await adapter.place_order(_approved(order_type="limit"))

    assert report.status == "rejected"
    assert report.error is not None
    assert "Insufficient margin" in report.error


@pytest.mark.asyncio
async def test_place_order_handles_status_entry_error() -> None:
    exchange = MagicMock()
    exchange.order.return_value = {
        "status": "ok",
        "response": {
            "type": "order",
            "data": {"statuses": [{"error": "Order would be rejected: bad price"}]},
        },
    }
    adapter = _make_adapter(info=MagicMock(), exchange=exchange)
    report = await adapter.place_order(_approved(order_type="limit"))

    assert report.status == "rejected"
    assert report.error is not None
    assert "bad price" in report.error


@pytest.mark.asyncio
async def test_place_order_sdk_exception_is_translated() -> None:
    exchange = MagicMock()
    exchange.order.side_effect = RuntimeError("boom")

    adapter = _make_adapter(info=MagicMock(), exchange=exchange)
    report = await adapter.place_order(_approved(order_type="limit"))

    assert report.status == "rejected"
    assert report.error == "boom"


@pytest.mark.asyncio
async def test_cancel_order_returns_true_on_ok() -> None:
    exchange = MagicMock()
    exchange.cancel.return_value = {"status": "ok"}

    adapter = _make_adapter(info=MagicMock(), exchange=exchange)
    ok = await adapter.cancel_order("ETH", "42")

    assert ok is True
    exchange.cancel.assert_called_once_with("ETH", 42)
