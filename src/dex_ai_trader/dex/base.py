"""Abstract base class shared by every DEX adapter.

Every adapter exposes the same async surface so the orchestrator can pick the
venue at runtime without branching on type. Concrete subclasses live alongside
this module: ``paper.PaperAdapter``, ``hyperliquid_adapter.HyperliquidAdapter``,
``asterdex_adapter.AsterDexAdapter``.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any

from ..models import ApprovedOrder, Balance, ExecutionReport, Market, Position, Ticker


class DexAdapter(ABC):
    """Common async interface for every venue."""

    name: str

    def __init__(self, *, name: str, logger: logging.Logger | None = None) -> None:
        self.name = name
        self.logger = logger if logger is not None else logging.getLogger(f"dex.{name}")

    # -- read-only --------------------------------------------------------

    @abstractmethod
    async def get_markets(self) -> list[Market]: ...

    @abstractmethod
    async def get_ticker(self, symbol: str) -> Ticker: ...

    @abstractmethod
    async def get_balances(self) -> list[Balance]: ...

    @abstractmethod
    async def get_positions(self) -> list[Position]: ...

    @abstractmethod
    async def get_open_orders(self, symbol: str | None = None) -> list[dict[str, Any]]: ...

    # -- mutating ---------------------------------------------------------

    @abstractmethod
    async def place_order(self, approved: ApprovedOrder) -> ExecutionReport:
        """Submit ``approved`` to the venue and return an ``ExecutionReport``.

        Contract for ``approved.trade.order_type``:

        * ``"limit"``: ``approved.trade.limit_price`` must be set; the adapter
          posts a resting limit order at that price (or fills it immediately if
          marketable). If ``limit_price`` is ``None`` the adapter must return
          ``ExecutionReport(status="rejected", error="...")`` rather than
          guessing a price.
        * ``"market"``: ``approved.trade.limit_price`` is optional. The adapter
          must fill at or near the prevailing mid for the symbol. The adapter
          must NOT require a ``limit_price`` for a market order; if it cannot
          honor a true market order it must derive a slip-protected price
          itself (e.g. read the venue's mid and apply a safety band).
          Implementations are free to use the venue's native MARKET type or an
          IoC limit at the slip-protected price.

        Implementations must catch venue-side exceptions and translate them
        into ``ExecutionReport(status="rejected", error=...)`` rather than
        propagating, so the orchestrator audit log captures the failure.
        """
        ...

    @abstractmethod
    async def cancel_order(self, symbol: str, exchange_order_id: str) -> bool: ...

    # -- lifecycle --------------------------------------------------------

    @abstractmethod
    async def close(self) -> None: ...


__all__ = ["DexAdapter"]
