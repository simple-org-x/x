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
    async def place_order(self, approved: ApprovedOrder) -> ExecutionReport: ...

    @abstractmethod
    async def cancel_order(self, symbol: str, exchange_order_id: str) -> bool: ...

    # -- lifecycle --------------------------------------------------------

    @abstractmethod
    async def close(self) -> None: ...


__all__ = ["DexAdapter"]
