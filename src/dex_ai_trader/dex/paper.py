"""In-memory paper-trading adapter used for dry-run mode and tests.

Maintains balances, positions and open orders in process-local state. There is
no I/O - the adapter is pure Python so tests can drive it deterministically.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from ..models import (
    ApprovedOrder,
    Balance,
    ExecutionReport,
    Market,
    Position,
    Ticker,
)
from .base import DexAdapter

DEFAULT_QUOTE = "USDC"
DEFAULT_INITIAL_CASH = 10_000.0
DEFAULT_MARK_PRICE = 100.0


def _default_mark_price(_symbol: str) -> float:
    return DEFAULT_MARK_PRICE


class PaperAdapter(DexAdapter):
    """Deterministic in-memory simulator.

    Args:
        initial_cash: starting balance in the quote asset (default 10_000 USDC).
        mark_price: callable that returns a mark price for a symbol. Default
            returns 100.0 for every symbol so tests are deterministic.
        markets: optional pre-populated market list. If None, an empty list is
            used and ``register_market`` may be called.
        quote_asset: asset name used for the cash balance (default ``USDC``).
        logger: optional logger.
    """

    def __init__(
        self,
        *,
        initial_cash: float = DEFAULT_INITIAL_CASH,
        mark_price: Callable[[str], float] | None = None,
        markets: list[Market] | None = None,
        quote_asset: str = DEFAULT_QUOTE,
        logger: logging.Logger | None = None,
    ) -> None:
        super().__init__(name="paper", logger=logger)
        self._mark_price = mark_price if mark_price is not None else _default_mark_price
        self._markets: list[Market] = list(markets) if markets else []
        self._quote_asset = quote_asset
        self._balances: dict[str, float] = {quote_asset: float(initial_cash)}
        self._positions: dict[str, Position] = {}
        self._open_orders: list[dict[str, Any]] = []
        self._next_order_id = 1
        self._realized_pnl = 0.0

    # -- helpers ----------------------------------------------------------

    def register_market(self, market: Market) -> None:
        self._markets.append(market)

    def set_mark_price(self, fn: Callable[[str], float]) -> None:
        self._mark_price = fn

    @property
    def realized_pnl(self) -> float:
        return self._realized_pnl

    # -- DexAdapter -------------------------------------------------------

    async def get_markets(self) -> list[Market]:
        return list(self._markets)

    async def get_ticker(self, symbol: str) -> Ticker:
        mid = float(self._mark_price(symbol))
        return Ticker(
            symbol=symbol,
            mid=mid,
            bid=mid,
            ask=mid,
            ts=datetime.now(tz=UTC),
        )

    async def get_balances(self) -> list[Balance]:
        return [
            Balance(asset=asset, total=amount, available=amount)
            for asset, amount in self._balances.items()
        ]

    async def get_positions(self) -> list[Position]:
        return list(self._positions.values())

    async def get_open_orders(self, symbol: str | None = None) -> list[dict[str, Any]]:
        if symbol is None:
            return [dict(o) for o in self._open_orders]
        return [dict(o) for o in self._open_orders if o["symbol"] == symbol]

    async def place_order(self, approved: ApprovedOrder) -> ExecutionReport:
        trade = approved.trade
        mark = float(self._mark_price(trade.symbol))

        # Decide whether the order fills now.
        fills = False
        fill_price = mark
        if trade.order_type == "market":
            fills = True
            fill_price = mark
        elif trade.order_type == "limit":
            limit = trade.limit_price
            if limit is None:
                return ExecutionReport(
                    decision_id=approved.decision_id,
                    venue="paper",
                    status="rejected",
                    filled_size=0.0,
                    avg_price=0.0,
                    error="limit order requires limit_price",
                )
            if (trade.side == "buy" and limit >= mark) or (trade.side == "sell" and limit <= mark):
                fills = True
                fill_price = mark

        if not fills:
            order_id = str(self._next_order_id)
            self._next_order_id += 1
            self._open_orders.append(
                {
                    "symbol": trade.symbol,
                    "side": trade.side,
                    "size": trade.size,
                    "limit_price": trade.limit_price,
                    "exchange_order_id": order_id,
                    "client_order_id": str(approved.decision_id),
                }
            )
            return ExecutionReport(
                decision_id=approved.decision_id,
                venue="paper",
                status="submitted",
                filled_size=0.0,
                avg_price=0.0,
                exchange_order_id=order_id,
            )

        # Apply the fill: update cash and position.
        signed_size = trade.size if trade.side == "buy" else -trade.size
        self._apply_fill(trade.symbol, signed_size, fill_price)

        order_id = str(self._next_order_id)
        self._next_order_id += 1
        return ExecutionReport(
            decision_id=approved.decision_id,
            venue="paper",
            status="paper",
            filled_size=trade.size,
            avg_price=fill_price,
            exchange_order_id=order_id,
        )

    async def cancel_order(self, symbol: str, exchange_order_id: str) -> bool:
        for idx, order in enumerate(self._open_orders):
            if order["symbol"] == symbol and order["exchange_order_id"] == exchange_order_id:
                self._open_orders.pop(idx)
                return True
        return False

    async def close(self) -> None:
        return None

    # -- internals --------------------------------------------------------

    def _apply_fill(self, symbol: str, signed_size: float, fill_price: float) -> None:
        notional = signed_size * fill_price
        # Cash leg: buying spends cash, selling adds cash.
        self._balances[self._quote_asset] = self._balances.get(self._quote_asset, 0.0) - notional

        existing = self._positions.get(symbol)
        if existing is None:
            self._positions[symbol] = Position(
                symbol=symbol,
                size=signed_size,
                entry_price=fill_price,
                unrealized_pnl=0.0,
                leverage=1.0,
            )
            return

        new_size = existing.size + signed_size

        # Closing or reducing the existing position realises PnL.
        if existing.size != 0 and (existing.size > 0) != (signed_size > 0):
            closed = min(abs(signed_size), abs(existing.size))
            direction = 1.0 if existing.size > 0 else -1.0
            self._realized_pnl += closed * (fill_price - existing.entry_price) * direction

        if abs(new_size) < 1e-12:
            # Position fully closed.
            self._positions.pop(symbol, None)
            return

        if (existing.size > 0) == (new_size > 0):
            # Same-direction add or partial close. Average entry only when adding.
            if (existing.size > 0) == (signed_size > 0):
                total_cost = existing.size * existing.entry_price + signed_size * fill_price
                new_entry = total_cost / new_size
            else:
                new_entry = existing.entry_price
        else:
            # Flipped direction; entry resets to fill price for the residual.
            new_entry = fill_price

        self._positions[symbol] = Position(
            symbol=symbol,
            size=new_size,
            entry_price=new_entry,
            unrealized_pnl=0.0,
            leverage=existing.leverage,
        )


__all__ = ["PaperAdapter"]
