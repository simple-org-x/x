"""AsterDex Futures REST adapter.

Implements the Binance-style V1 (Legacy) auth scheme documented at
https://github.com/asterdex/api-docs/blob/master/V1(Legacy)/EN/aster-finance-futures-api.md:

* Every signed request carries header ``X-MBX-APIKEY`` set to the API key.
* Signed requests append ``timestamp`` and ``recvWindow`` to the query string,
  build the canonical query string, and append a ``signature`` parameter that
  is ``HMAC-SHA256(api_secret, query_string).hexdigest()``.
* Base URL defaults to ``https://fapi.asterdex.com``; tests override via the
  ``base_url`` constructor argument.

This adapter never logs the API secret. The signing helper is intentionally a
small pure function so it can be hand-verified in tests against an
independently-computed HMAC.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from typing import Any
from urllib.parse import urlencode

import httpx

from ..models import (
    ApprovedOrder,
    Balance,
    ExecutionReport,
    Market,
    Position,
    Ticker,
)
from .base import DexAdapter

DEFAULT_MAINNET_URL = "https://fapi.asterdex.com"
DEFAULT_TESTNET_URL = "https://testnet.asterdex.com"
DEFAULT_RECV_WINDOW_MS = 5_000


def sign_query(api_secret: str, query_string: str) -> str:
    """Return the lowercase hex HMAC-SHA256 of ``query_string`` keyed by ``api_secret``.

    Pure function: no I/O, no globals. The caller is responsible for building a
    canonical, properly url-encoded query string.
    """
    return hmac.new(
        api_secret.encode("utf-8"),
        query_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def build_canonical_query(params: dict[str, Any]) -> str:
    """Build the canonical query string used as the HMAC payload.

    Order is preserved (``urlencode`` over ``params.items()``), matching the
    AsterDex/Binance convention that the *exact* string sent on the wire is
    what gets signed.
    """
    return urlencode([(k, v) for k, v in params.items() if v is not None])


class AsterDexAdapter(DexAdapter):
    """httpx-based async client for AsterDex futures."""

    def __init__(
        self,
        *,
        api_key: str,
        api_secret: str,
        testnet: bool = True,
        base_url: str | None = None,
        recv_window_ms: int = DEFAULT_RECV_WINDOW_MS,
        client: httpx.AsyncClient | None = None,
        logger: logging.Logger | None = None,
        clock: Any = None,
    ) -> None:
        super().__init__(name="asterdex", logger=logger)
        self._api_key = api_key
        self._api_secret = api_secret
        if base_url is None:
            base_url = DEFAULT_TESTNET_URL if testnet else DEFAULT_MAINNET_URL
        self._base_url = base_url.rstrip("/")
        self._recv_window_ms = recv_window_ms
        self._owns_client = client is None
        self._client = client if client is not None else httpx.AsyncClient(base_url=self._base_url)
        # ``clock`` lets tests inject a deterministic timestamp source.
        self._clock = clock if clock is not None else _wall_clock_ms

    # -- HTTP helpers -----------------------------------------------------

    def _headers(self, *, signed: bool) -> dict[str, str]:
        if signed:
            return {"X-MBX-APIKEY": self._api_key}
        return {}

    def _sign_params(self, params: dict[str, Any]) -> tuple[dict[str, Any], str]:
        signed_params: dict[str, Any] = {k: v for k, v in params.items() if v is not None}
        signed_params["recvWindow"] = self._recv_window_ms
        signed_params["timestamp"] = int(self._clock())
        canonical = build_canonical_query(signed_params)
        signature = sign_query(self._api_secret, canonical)
        signed_params["signature"] = signature
        return signed_params, signature

    async def _public_request(
        self, method: str, path: str, params: dict[str, Any] | None = None
    ) -> httpx.Response:
        return await self._client.request(
            method, path, params=params or {}, headers=self._headers(signed=False)
        )

    async def _signed_request(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
    ) -> httpx.Response:
        signed_params, _signature = self._sign_params(dict(params or {}))
        # Always send the signed payload as URL parameters; AsterDex/Binance
        # accepts this for every signed endpoint, including POST/DELETE.
        return await self._client.request(
            method,
            path,
            params=signed_params,
            headers=self._headers(signed=True),
        )

    # -- DexAdapter -------------------------------------------------------

    async def get_markets(self) -> list[Market]:
        resp = await self._public_request("GET", "/fapi/v1/exchangeInfo")
        resp.raise_for_status()
        body = resp.json()
        markets: list[Market] = []
        for s in body.get("symbols", []):
            # Default min_size: pull from LOT_SIZE filter if present.
            min_size = 0.0
            for filt in s.get("filters", []):
                if filt.get("filterType") == "LOT_SIZE":
                    try:
                        min_size = float(filt.get("minQty", 0.0))
                    except (TypeError, ValueError):
                        min_size = 0.0
                    break
            markets.append(
                Market(
                    symbol=str(s["symbol"]),
                    base=str(s.get("baseAsset", "")),
                    quote=str(s.get("quoteAsset", "")),
                    venue="asterdex",
                    min_size=min_size,
                    price_precision=int(s.get("pricePrecision", 0)),
                )
            )
        return markets

    async def get_ticker(self, symbol: str) -> Ticker:
        resp = await self._public_request("GET", "/fapi/v1/ticker/bookTicker", {"symbol": symbol})
        resp.raise_for_status()
        body = resp.json()
        if isinstance(body, list):
            # /bookTicker without symbol returns a list; locate ours.
            entry = next((b for b in body if b.get("symbol") == symbol), None)
            if entry is None:
                raise ValueError(f"symbol {symbol} not found in bookTicker response")
            body = entry
        bid = float(body["bidPrice"])
        ask = float(body["askPrice"])
        ts_ms = int(body.get("time", int(self._clock())))
        from datetime import UTC, datetime

        ts = datetime.fromtimestamp(ts_ms / 1000.0, tz=UTC)
        return Ticker(
            symbol=str(body.get("symbol", symbol)),
            mid=(bid + ask) / 2.0,
            bid=bid,
            ask=ask,
            ts=ts,
        )

    async def get_balances(self) -> list[Balance]:
        resp = await self._signed_request("GET", "/fapi/v2/balance")
        resp.raise_for_status()
        balances: list[Balance] = []
        for entry in resp.json():
            balances.append(
                Balance(
                    asset=str(entry["asset"]),
                    total=float(entry.get("balance", 0.0)),
                    available=float(entry.get("availableBalance", 0.0)),
                )
            )
        return balances

    async def get_positions(self) -> list[Position]:
        resp = await self._signed_request("GET", "/fapi/v2/positionRisk")
        resp.raise_for_status()
        positions: list[Position] = []
        for entry in resp.json():
            size = float(entry.get("positionAmt", 0.0))
            if size == 0.0:
                continue
            positions.append(
                Position(
                    symbol=str(entry["symbol"]),
                    size=size,
                    entry_price=float(entry.get("entryPrice", 0.0)),
                    unrealized_pnl=float(entry.get("unRealizedProfit", 0.0)),
                    leverage=float(entry.get("leverage", 1.0)),
                )
            )
        return positions

    async def get_open_orders(self, symbol: str | None = None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        if symbol is not None:
            params["symbol"] = symbol
        resp = await self._signed_request("GET", "/fapi/v1/openOrders", params)
        resp.raise_for_status()
        body = resp.json()
        return [dict(item) for item in body]

    async def place_order(self, approved: ApprovedOrder) -> ExecutionReport:
        trade = approved.trade
        params: dict[str, Any] = {
            "symbol": trade.symbol,
            "side": "BUY" if trade.side == "buy" else "SELL",
            "type": "LIMIT" if trade.order_type == "limit" else "MARKET",
            "quantity": trade.size,
            "newClientOrderId": str(approved.decision_id),
        }
        if trade.order_type == "limit":
            if trade.limit_price is None:
                return ExecutionReport(
                    decision_id=approved.decision_id,
                    venue="asterdex",
                    status="rejected",
                    filled_size=0.0,
                    avg_price=0.0,
                    error="limit order requires limit_price",
                )
            params["price"] = trade.limit_price
            params["timeInForce"] = "GTC"

        resp = await self._signed_request("POST", "/fapi/v1/order", params)
        if resp.status_code >= 400:
            try:
                body = resp.json()
                error = f"{body.get('code', resp.status_code)}: {body.get('msg', '')}".strip(": ")
            except Exception:  # noqa: BLE001 - any malformed body
                error = resp.text
            return ExecutionReport(
                decision_id=approved.decision_id,
                venue="asterdex",
                status="rejected",
                filled_size=0.0,
                avg_price=0.0,
                error=error,
            )

        body = resp.json()
        return self._parse_order_response(approved, body)

    async def cancel_order(self, symbol: str, exchange_order_id: str) -> bool:
        resp = await self._signed_request(
            "DELETE",
            "/fapi/v1/order",
            {"symbol": symbol, "orderId": exchange_order_id},
        )
        if resp.status_code >= 400:
            self.logger.warning(
                "asterdex cancel failed status=%s body=%s", resp.status_code, resp.text
            )
            return False
        return True

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    # -- helpers ----------------------------------------------------------

    @staticmethod
    def _parse_order_response(approved: ApprovedOrder, body: dict[str, Any]) -> ExecutionReport:
        status_raw = str(body.get("status", "")).upper()
        executed_qty = float(body.get("executedQty", 0.0) or 0.0)
        avg_price = float(body.get("avgPrice", 0.0) or 0.0)
        order_id = str(body["orderId"]) if "orderId" in body else None

        if status_raw == "FILLED":
            status = "filled"
        elif status_raw == "PARTIALLY_FILLED":
            status = "partial"
        elif status_raw in {"REJECTED", "EXPIRED", "CANCELED"}:
            status = "rejected"
        else:
            # NEW / ACCEPTED / etc. -> resting on book.
            status = "submitted"

        return ExecutionReport(
            decision_id=approved.decision_id,
            venue="asterdex",
            status=status,  # type: ignore[arg-type]
            filled_size=executed_qty,
            avg_price=avg_price,
            exchange_order_id=order_id,
            error=None,
        )


def _wall_clock_ms() -> int:
    return int(time.time() * 1000)


__all__ = ["AsterDexAdapter", "sign_query", "build_canonical_query"]
