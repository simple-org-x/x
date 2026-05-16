"""Pydantic v2 models for the trade lifecycle."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

Side = Literal["buy", "sell"]
OrderType = Literal["market", "limit"]
Verdict = Literal["approve", "reject", "amend"]
ExecutionStatus = Literal["filled", "partial", "rejected", "paper", "submitted"]
Venue = Literal["hyperliquid", "asterdex", "paper"]


class _Base(BaseModel):
    """Common base config: forbid extras to keep payloads strict."""

    model_config = ConfigDict(extra="forbid")


class Market(_Base):
    symbol: str
    base: str
    quote: str
    venue: Venue
    min_size: float
    price_precision: int


class Ticker(_Base):
    symbol: str
    mid: float
    bid: float
    ask: float
    ts: datetime


class Position(_Base):
    symbol: str
    size: float
    entry_price: float
    unrealized_pnl: float
    leverage: float


class Balance(_Base):
    asset: str
    total: float
    available: float


class ProposedTrade(_Base):
    venue: Venue
    symbol: str
    side: Side
    order_type: OrderType
    size: float
    limit_price: float | None = None
    rationale: str
    confidence: float = Field(ge=0.0, le=1.0)
    analyst_id: str


class ReviewedTrade(_Base):
    proposed: ProposedTrade
    verdict: Verdict
    critique: str
    amended: ProposedTrade | None = None
    reviewer_id: str


class ApprovedOrder(_Base):
    trade: ProposedTrade
    decision_id: UUID
    approved_at: datetime
    responsible_id: str
    signature: str


class ExecutionReport(_Base):
    decision_id: UUID
    venue: Venue
    status: ExecutionStatus
    filled_size: float
    avg_price: float
    exchange_order_id: str | None = None
    error: str | None = None


class AgentContext(_Base):
    markets: list[Market] = Field(default_factory=list)
    tickers: dict[str, Ticker] = Field(default_factory=dict)
    positions: list[Position] = Field(default_factory=list)
    balances: list[Balance] = Field(default_factory=list)
    history: list[ExecutionReport] = Field(default_factory=list)
    notes: str = ""


__all__ = [
    "Side",
    "OrderType",
    "Verdict",
    "ExecutionStatus",
    "Venue",
    "Market",
    "Ticker",
    "Position",
    "Balance",
    "ProposedTrade",
    "ReviewedTrade",
    "ApprovedOrder",
    "ExecutionReport",
    "AgentContext",
]
