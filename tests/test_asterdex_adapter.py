"""Tests for the AsterDex REST adapter.

Uses respx (https://lundberg.github.io/respx) to intercept httpx requests so
no real network is touched. Signature correctness is asserted by hand-computing
HMAC-SHA256 over the canonical query string and comparing byte-for-byte.
"""

from __future__ import annotations

import hashlib
import hmac
from datetime import UTC, datetime
from urllib.parse import parse_qsl, urlencode
from uuid import uuid4

import httpx
import pytest
import respx

from dex_ai_trader.dex.asterdex_adapter import (
    AsterDexAdapter,
    build_canonical_query,
    sign_query,
)
from dex_ai_trader.models import ApprovedOrder, ProposedTrade

API_KEY = "dbefbc809e3e83c283a984c3a1459732ea7db1360ca80c5c2c8867408d28cc83"
API_SECRET = "2b5eb11e18796d12d88f13dc27dbbd02c2cc51ff7059765ed9821957d82bb4d9"
BASE_URL = "https://fapi.asterdex.com"
FIXED_TS_MS = 1_591_702_613_943


@pytest.fixture
def adapter() -> AsterDexAdapter:
    client = httpx.AsyncClient(base_url=BASE_URL)
    return AsterDexAdapter(
        api_key=API_KEY,
        api_secret=API_SECRET,
        testnet=False,
        base_url=BASE_URL,
        client=client,
        clock=lambda: FIXED_TS_MS,
    )


def _approved(side: str = "buy", order_type: str = "limit") -> ApprovedOrder:
    trade = ProposedTrade(
        venue="asterdex",
        symbol="BTCUSDT",
        side=side,  # type: ignore[arg-type]
        order_type=order_type,  # type: ignore[arg-type]
        size=1.0,
        limit_price=9000.0 if order_type == "limit" else None,
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


def test_sign_query_matches_documented_example() -> None:
    """Hand-compute the exact HMAC from the AsterDex docs and compare bytes."""
    query = (
        "symbol=BTCUSDT&side=BUY&type=LIMIT&quantity=1&price=9000"
        "&timeInForce=GTC&recvWindow=5000&timestamp=1591702613943"
    )

    expected = hmac.new(
        API_SECRET.encode("utf-8"),
        query.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    actual = sign_query(API_SECRET, query)

    assert actual == expected
    # And matches the literal value baked into the AsterDex documentation.
    assert actual == "3c661234138461fcc7a7d8746c6558c9842d4e10870d2ecbedf7777cad694af9"


@pytest.mark.asyncio
@respx.mock
async def test_get_balances_signs_and_carries_api_key(adapter: AsterDexAdapter) -> None:
    route = respx.get(f"{BASE_URL}/fapi/v2/balance").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "asset": "USDT",
                    "balance": "1000.0",
                    "availableBalance": "950.0",
                }
            ],
        )
    )

    balances = await adapter.get_balances()

    assert len(balances) == 1
    assert balances[0].asset == "USDT"
    assert balances[0].total == 1000.0
    assert balances[0].available == 950.0

    assert route.called
    request = route.calls.last.request

    # Header carries the API key but never the secret.
    assert request.headers["X-MBX-APIKEY"] == API_KEY
    assert API_SECRET not in dict(request.headers).values()

    # Recompute the expected signature from the params actually sent.
    qs_pairs = parse_qsl(request.url.query.decode("ascii"), keep_blank_values=True)
    params = dict(qs_pairs)
    sent_sig = params.pop("signature")
    canonical = urlencode([(k, v) for k, v in qs_pairs if k != "signature"])
    expected_sig = sign_query(API_SECRET, canonical)
    assert sent_sig == expected_sig
    assert params["recvWindow"] == "5000"
    assert params["timestamp"] == str(FIXED_TS_MS)


@pytest.mark.asyncio
@respx.mock
async def test_place_limit_order_filled_response(adapter: AsterDexAdapter) -> None:
    captured: dict[str, str] = {}

    def respond(request: httpx.Request) -> httpx.Response:
        for k, v in parse_qsl(request.url.query.decode("ascii"), keep_blank_values=True):
            captured[k] = v
        return httpx.Response(
            200,
            json={
                "orderId": 22542179,
                "status": "FILLED",
                "executedQty": "1.0",
                "avgPrice": "9000.0",
                "symbol": "BTCUSDT",
            },
        )

    route = respx.post(f"{BASE_URL}/fapi/v1/order").mock(side_effect=respond)

    approved = _approved(order_type="limit")
    report = await adapter.place_order(approved)

    assert route.called
    assert captured["symbol"] == "BTCUSDT"
    assert captured["side"] == "BUY"
    assert captured["type"] == "LIMIT"
    assert captured["timeInForce"] == "GTC"
    assert captured["quantity"] == "1.0"
    assert captured["price"] == "9000.0"
    assert captured["newClientOrderId"] == str(approved.decision_id)
    assert "signature" in captured

    # Recompute and compare HMAC against the canonical pre-signature payload.
    pairs = list(parse_qsl(route.calls.last.request.url.query.decode("ascii")))
    pre_signature = urlencode([(k, v) for k, v in pairs if k != "signature"])
    expected_sig = sign_query(API_SECRET, pre_signature)
    assert captured["signature"] == expected_sig

    assert report.status == "filled"
    assert report.filled_size == 1.0
    assert report.avg_price == 9000.0
    assert report.exchange_order_id == "22542179"


@pytest.mark.asyncio
@respx.mock
async def test_place_market_order_returns_submitted_for_new(
    adapter: AsterDexAdapter,
) -> None:
    respx.post(f"{BASE_URL}/fapi/v1/order").mock(
        return_value=httpx.Response(
            200,
            json={
                "orderId": 999,
                "status": "NEW",
                "executedQty": "0.0",
                "avgPrice": "0.0",
                "symbol": "BTCUSDT",
            },
        )
    )

    report = await adapter.place_order(_approved(order_type="market"))

    assert report.status == "submitted"
    assert report.exchange_order_id == "999"


@pytest.mark.asyncio
@respx.mock
async def test_invalid_symbol_returns_rejected(adapter: AsterDexAdapter) -> None:
    respx.post(f"{BASE_URL}/fapi/v1/order").mock(
        return_value=httpx.Response(400, json={"code": -1121, "msg": "Invalid symbol."})
    )

    report = await adapter.place_order(_approved(order_type="market"))

    assert report.status == "rejected"
    assert report.error is not None
    assert "Invalid symbol" in report.error
    assert "-1121" in report.error


@pytest.mark.asyncio
@respx.mock
async def test_get_markets_parses_symbols(adapter: AsterDexAdapter) -> None:
    respx.get(f"{BASE_URL}/fapi/v1/exchangeInfo").mock(
        return_value=httpx.Response(
            200,
            json={
                "symbols": [
                    {
                        "symbol": "BTCUSDT",
                        "baseAsset": "BTC",
                        "quoteAsset": "USDT",
                        "pricePrecision": 2,
                        "filters": [
                            {
                                "filterType": "LOT_SIZE",
                                "minQty": "0.001",
                                "maxQty": "1000",
                                "stepSize": "0.001",
                            }
                        ],
                    }
                ]
            },
        )
    )

    markets = await adapter.get_markets()

    assert len(markets) == 1
    assert markets[0].symbol == "BTCUSDT"
    assert markets[0].base == "BTC"
    assert markets[0].quote == "USDT"
    assert markets[0].venue == "asterdex"
    assert markets[0].min_size == pytest.approx(0.001)
    assert markets[0].price_precision == 2


@pytest.mark.asyncio
@respx.mock
async def test_get_ticker_parses_book_ticker(adapter: AsterDexAdapter) -> None:
    respx.get(f"{BASE_URL}/fapi/v1/ticker/bookTicker").mock(
        return_value=httpx.Response(
            200,
            json={
                "symbol": "BTCUSDT",
                "bidPrice": "29999.0",
                "bidQty": "1",
                "askPrice": "30001.0",
                "askQty": "1",
                "time": 1_700_000_000_000,
            },
        )
    )

    ticker = await adapter.get_ticker("BTCUSDT")

    assert ticker.symbol == "BTCUSDT"
    assert ticker.bid == 29999.0
    assert ticker.ask == 30001.0
    assert ticker.mid == 30000.0


@pytest.mark.asyncio
@respx.mock
async def test_get_positions_filters_zero_size(adapter: AsterDexAdapter) -> None:
    respx.get(f"{BASE_URL}/fapi/v2/positionRisk").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "symbol": "BTCUSDT",
                    "positionAmt": "1.5",
                    "entryPrice": "30000.0",
                    "leverage": "10",
                    "unRealizedProfit": "150.0",
                },
                {
                    "symbol": "ETHUSDT",
                    "positionAmt": "0.0",
                    "entryPrice": "0.0",
                    "leverage": "5",
                    "unRealizedProfit": "0.0",
                },
            ],
        )
    )

    positions = await adapter.get_positions()

    assert len(positions) == 1
    assert positions[0].symbol == "BTCUSDT"
    assert positions[0].size == 1.5
    assert positions[0].leverage == 10.0


@pytest.mark.asyncio
@respx.mock
async def test_cancel_order_signed(adapter: AsterDexAdapter) -> None:
    route = respx.delete(f"{BASE_URL}/fapi/v1/order").mock(
        return_value=httpx.Response(200, json={"status": "CANCELED", "orderId": 42})
    )

    ok = await adapter.cancel_order("BTCUSDT", "42")

    assert ok is True
    assert route.called
    request = route.calls.last.request
    assert request.headers["X-MBX-APIKEY"] == API_KEY
    params = dict(parse_qsl(request.url.query.decode("ascii")))
    assert params["symbol"] == "BTCUSDT"
    assert params["orderId"] == "42"
    assert "signature" in params


def test_secret_never_appears_in_canonical_query() -> None:
    """Belt-and-braces: the canonical query never embeds the api_secret."""
    canonical = build_canonical_query(
        {"symbol": "BTCUSDT", "side": "BUY", "timestamp": 1, "recvWindow": 5000}
    )
    assert API_SECRET not in canonical
