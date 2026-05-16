"""Hyperliquid adapter wrapping ``hyperliquid-python-sdk``.

WARNING: this adapter signs and submits real on-chain trades when not running
in dry-run/paper mode. The orchestrator must gate calls to ``place_order``
behind the ``run.live`` and ``credentials.live`` invariants.

Per the Hyperliquid SDK README the credentials are:
* ``account_address`` - the main wallet that holds the funds (0x...).
* a secret key that may belong either to the main wallet or to an "API wallet"
  generated at https://app.hyperliquid.xyz/API. The SDK signs payloads with
  the API wallet but reads/writes account state for ``account_address``.

The optional ``hyperliquid`` extra is imported lazily inside ``__init__`` so
this module can be imported without the SDK installed.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from ..models import (
    ApprovedOrder,
    Balance,
    ExecutionReport,
    Market,
    Position,
    Ticker,
)
from .base import DexAdapter

if TYPE_CHECKING:  # pragma: no cover - import-only for type hints
    from hyperliquid.exchange import Exchange
    from hyperliquid.info import Info


# Protective slippage band applied to market orders when the analyst does not
# supply an explicit ``limit_price``. 1% is intentionally wide for sandbox use;
# operators with tighter tolerances should set ``order_type='limit'`` and
# supply their own ``limit_price``.
DEFAULT_MARKET_SLIP_BPS = 100  # 100 bps = 1.0%


class HyperliquidAdapter(DexAdapter):
    """Async wrapper around the synchronous hyperliquid SDK.

    All blocking SDK calls are dispatched via :func:`asyncio.to_thread` so the
    surface stays async-compatible.
    """

    def __init__(
        self,
        *,
        wallet_address: str,
        api_wallet_private_key: str,
        testnet: bool = True,
        info: Info | None = None,
        exchange: Exchange | None = None,
        logger: logging.Logger | None = None,
    ) -> None:
        super().__init__(name="hyperliquid", logger=logger)
        self._wallet_address = wallet_address

        if info is None or exchange is None:
            # Lazy imports keep the optional SDK truly optional.
            from eth_account import Account
            from hyperliquid.exchange import Exchange as _Exchange
            from hyperliquid.info import Info as _Info
            from hyperliquid.utils import constants

            base_url = constants.TESTNET_API_URL if testnet else constants.MAINNET_API_URL
            account = Account.from_key(api_wallet_private_key)
            if info is None:
                info = _Info(base_url, skip_ws=True)
            if exchange is None:
                exchange = _Exchange(account, base_url=base_url, account_address=wallet_address)

        self._info = info
        self._exchange = exchange

    # -- DexAdapter -------------------------------------------------------

    async def get_markets(self) -> list[Market]:
        meta = await asyncio.to_thread(self._info.meta)
        universe = meta.get("universe", []) if isinstance(meta, dict) else []
        markets: list[Market] = []
        for asset in universe:
            symbol = str(asset.get("name", ""))
            if not symbol:
                continue
            markets.append(
                Market(
                    symbol=symbol,
                    base=symbol,
                    quote="USDC",
                    venue="hyperliquid",
                    min_size=float(asset.get("szDecimals", 0) and 10 ** -int(asset["szDecimals"])),
                    price_precision=int(asset.get("szDecimals", 0)),
                )
            )
        return markets

    async def get_ticker(self, symbol: str) -> Ticker:
        mids = await asyncio.to_thread(self._info.all_mids)
        if not isinstance(mids, dict) or symbol not in mids:
            raise ValueError(f"symbol {symbol} not found in Hyperliquid all_mids")
        mid = float(mids[symbol])
        return Ticker(
            symbol=symbol,
            mid=mid,
            bid=mid,
            ask=mid,
            ts=datetime.now(tz=UTC),
        )

    async def get_balances(self) -> list[Balance]:
        state = await asyncio.to_thread(self._info.user_state, self._wallet_address)
        margin = state.get("marginSummary", {}) if isinstance(state, dict) else {}
        balances: list[Balance] = []
        if margin:
            account_value = float(margin.get("accountValue", 0.0))
            withdrawable = float(state.get("withdrawable", account_value))
            balances.append(Balance(asset="USDC", total=account_value, available=withdrawable))
        return balances

    async def get_positions(self) -> list[Position]:
        state = await asyncio.to_thread(self._info.user_state, self._wallet_address)
        asset_positions = state.get("assetPositions", []) if isinstance(state, dict) else []
        positions: list[Position] = []
        for entry in asset_positions:
            position = entry.get("position", {}) if isinstance(entry, dict) else {}
            if not position:
                continue
            size = float(position.get("szi", 0.0))
            if size == 0.0:
                continue
            leverage = position.get("leverage", {})
            lev_value = float(leverage.get("value", 1.0)) if isinstance(leverage, dict) else 1.0
            positions.append(
                Position(
                    symbol=str(position.get("coin", "")),
                    size=size,
                    entry_price=float(position.get("entryPx", 0.0) or 0.0),
                    unrealized_pnl=float(position.get("unrealizedPnl", 0.0) or 0.0),
                    leverage=lev_value,
                )
            )
        return positions

    async def get_open_orders(self, symbol: str | None = None) -> list[dict[str, Any]]:
        orders = await asyncio.to_thread(self._info.open_orders, self._wallet_address)
        if not isinstance(orders, list):
            return []
        if symbol is None:
            return [dict(o) for o in orders]
        return [dict(o) for o in orders if o.get("coin") == symbol]

    async def place_order(self, approved: ApprovedOrder) -> ExecutionReport:
        trade = approved.trade
        is_buy = trade.side == "buy"

        if trade.order_type == "limit":
            if trade.limit_price is None:
                return ExecutionReport(
                    decision_id=approved.decision_id,
                    venue="hyperliquid",
                    status="rejected",
                    filled_size=0.0,
                    avg_price=0.0,
                    error="limit order requires limit_price",
                )
            limit_px = float(trade.limit_price)
            order_type: dict[str, Any] = {"limit": {"tif": "Gtc"}}
        else:
            # Hyperliquid does not have a native "market" order type; the SDK
            # accepts an IoC limit at a slip-protected price. When the analyst
            # supplied a ``limit_price`` we honour it; otherwise we read the
            # current mid via ``info.all_mids`` and apply a 1% protective band
            # (cap on a buy, floor on a sell). Sending ``limit_px=0.0``, as a
            # previous version did, is functionally a "fill at any price"
            # instruction on the sell side and an unfillable order on the buy
            # side, neither of which matches the contract for a market order.
            order_type = {"limit": {"tif": "Ioc"}}
            if trade.limit_price is not None:
                limit_px = float(trade.limit_price)
            else:
                try:
                    limit_px = await self._market_slip_price(trade.symbol, is_buy)
                except Exception as exc:  # noqa: BLE001 - any SDK / parse error
                    self.logger.exception("hyperliquid market slip-price lookup failed")
                    return ExecutionReport(
                        decision_id=approved.decision_id,
                        venue="hyperliquid",
                        status="rejected",
                        filled_size=0.0,
                        avg_price=0.0,
                        error=f"unable to derive market slip price: {exc}",
                    )

        try:
            response = await asyncio.to_thread(
                self._exchange.order,
                trade.symbol,
                is_buy,
                float(trade.size),
                limit_px,
                order_type,
                False,
            )
        except Exception as exc:  # noqa: BLE001 - SDK raises a variety of types
            self.logger.exception("hyperliquid order failed")
            return ExecutionReport(
                decision_id=approved.decision_id,
                venue="hyperliquid",
                status="rejected",
                filled_size=0.0,
                avg_price=0.0,
                error=str(exc),
            )

        return self._parse_order_response(approved, response)

    async def cancel_order(self, symbol: str, exchange_order_id: str) -> bool:
        try:
            oid = int(exchange_order_id)
        except (TypeError, ValueError):
            return False
        try:
            response = await asyncio.to_thread(self._exchange.cancel, symbol, oid)
        except Exception:  # noqa: BLE001
            self.logger.exception("hyperliquid cancel failed")
            return False
        return isinstance(response, dict) and response.get("status") == "ok"

    async def close(self) -> None:
        # The SDK keeps an HTTP session open for ``post`` calls. Best-effort close.
        for obj in (self._info, self._exchange):
            session = getattr(obj, "session", None)
            if session is not None and hasattr(session, "close"):
                try:
                    session.close()
                except Exception:  # noqa: BLE001
                    self.logger.debug("error closing hyperliquid session", exc_info=True)

    # -- helpers ----------------------------------------------------------

    async def _market_slip_price(self, symbol: str, is_buy: bool) -> float:
        """Compute a slip-protected limit price for an IoC market order.

        Reads the latest mid via ``info.all_mids`` and shifts it by
        :data:`DEFAULT_MARKET_SLIP_BPS` basis points. Buys cap at
        ``mid * (1 + bps/10000)`` (we are willing to pay up to that),
        sells floor at ``mid * (1 - bps/10000)`` (we will accept down to
        that). Returns a strictly positive float; raises ``ValueError`` if
        the mid is missing or non-positive.
        """
        mids = await asyncio.to_thread(self._info.all_mids)
        if not isinstance(mids, dict) or symbol not in mids:
            raise ValueError(f"no mid available for {symbol}")
        mid = float(mids[symbol])
        if mid <= 0.0:
            raise ValueError(f"mid for {symbol} is non-positive: {mid}")
        bps = DEFAULT_MARKET_SLIP_BPS / 10_000.0
        return mid * (1.0 + bps) if is_buy else mid * (1.0 - bps)

    @staticmethod
    def _parse_order_response(approved: ApprovedOrder, response: Any) -> ExecutionReport:
        if not isinstance(response, dict):
            return ExecutionReport(
                decision_id=approved.decision_id,
                venue="hyperliquid",
                status="rejected",
                filled_size=0.0,
                avg_price=0.0,
                error=f"unexpected response type: {type(response).__name__}",
            )

        if response.get("status") != "ok":
            return ExecutionReport(
                decision_id=approved.decision_id,
                venue="hyperliquid",
                status="rejected",
                filled_size=0.0,
                avg_price=0.0,
                error=str(response.get("response") or response),
            )

        # Successful envelope: {"status":"ok","response":{"type":"order","data":{"statuses":[...]}}}
        statuses = (
            response.get("response", {}).get("data", {}).get("statuses", [])
            if isinstance(response.get("response"), dict)
            else []
        )
        for status_entry in statuses:
            if not isinstance(status_entry, dict):
                continue
            if "filled" in status_entry:
                filled = status_entry["filled"]
                return ExecutionReport(
                    decision_id=approved.decision_id,
                    venue="hyperliquid",
                    status="filled",
                    filled_size=float(filled.get("totalSz", 0.0) or 0.0),
                    avg_price=float(filled.get("avgPx", 0.0) or 0.0),
                    exchange_order_id=str(filled.get("oid", "")),
                )
            if "resting" in status_entry:
                resting = status_entry["resting"]
                return ExecutionReport(
                    decision_id=approved.decision_id,
                    venue="hyperliquid",
                    status="submitted",
                    filled_size=0.0,
                    avg_price=0.0,
                    exchange_order_id=str(resting.get("oid", "")),
                )
            if "error" in status_entry:
                return ExecutionReport(
                    decision_id=approved.decision_id,
                    venue="hyperliquid",
                    status="rejected",
                    filled_size=0.0,
                    avg_price=0.0,
                    error=str(status_entry["error"]),
                )

        # Fall back: ok with no recognised status entry.
        return ExecutionReport(
            decision_id=approved.decision_id,
            venue="hyperliquid",
            status="submitted",
            filled_size=0.0,
            avg_price=0.0,
            error=None,
        )


__all__ = ["HyperliquidAdapter", "DEFAULT_MARKET_SLIP_BPS"]
