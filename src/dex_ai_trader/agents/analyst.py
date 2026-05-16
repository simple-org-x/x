"""Analyst agent: studies the context and proposes a trade (or 'hold').

Output schema (JSON):

    {
      "action": "trade" | "hold",
      "venue": "paper"|"hyperliquid"|"asterdex",  # required when action=='trade'
      "symbol": "BTC-USD",
      "side": "buy" | "sell",
      "order_type": "market" | "limit",
      "size": float > 0,
      "limit_price": float | null,
      "rationale": "<= 600 chars",
      "confidence": float in [0, 1]
    }

When ``action == "hold"`` only ``action`` and ``rationale`` are required; the
agent returns a sentinel :class:`ProposedTrade` with ``size=0`` and ``side="buy"``
so downstream agents can treat it as 'no trade this cycle'.
"""

from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from ..models import AgentContext, ProposedTrade
from .base import Agent, AgentError

ANALYST_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["trade", "hold"]},
        "venue": {"type": "string", "enum": ["paper", "hyperliquid", "asterdex"]},
        "symbol": {"type": "string"},
        "side": {"type": "string", "enum": ["buy", "sell"]},
        "order_type": {"type": "string", "enum": ["market", "limit"]},
        "size": {"type": "number"},
        "limit_price": {"type": ["number", "null"]},
        "rationale": {"type": "string", "maxLength": 600},
        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
    },
    "required": ["action", "rationale"],
}


class AnalystOutput(BaseModel):
    """Validated analyst response."""

    model_config = ConfigDict(extra="forbid")

    action: Literal["trade", "hold"]
    venue: Literal["paper", "hyperliquid", "asterdex"] | None = None
    symbol: str | None = None
    side: Literal["buy", "sell"] | None = None
    order_type: Literal["market", "limit"] | None = None
    size: float | None = None
    limit_price: float | None = None
    rationale: str = Field(max_length=600)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class AnalystAgent(Agent):
    """Studies the context and emits a :class:`ProposedTrade`.

    A 'hold' decision is encoded as a ``ProposedTrade`` with ``size=0`` and a
    sentinel ``side='buy'``; downstream agents treat ``size==0`` as 'no trade'.
    """

    name = "analyst"

    SYSTEM_PROMPT = (
        "You are a disciplined crypto-derivatives Analyst. Study the supplied market state "
        "(tickers, positions, balances) and either propose ONE concrete trade or return "
        "{action:'hold', rationale:'...'}. Output STRICT JSON only - no prose. Required fields "
        "for a trade: venue, symbol, side, order_type, size>0, rationale (<=600 chars), "
        "confidence in [0,1]. limit_price is required for limit orders. Pick size conservatively."
    )

    async def run(self, ctx: AgentContext, *, default_symbol: str | None = None) -> ProposedTrade:
        user_prompt = self._build_user_prompt(ctx, default_symbol)
        out = await self._ask_llm(
            system_prompt=self.SYSTEM_PROMPT,
            user_prompt=user_prompt,
            schema=ANALYST_SCHEMA,
            output_model=AnalystOutput,
        )

        if out.action == "hold":
            # Sentinel: size=0 means 'no trade this cycle'. Use the default symbol
            # if available so the audit log can correlate; otherwise use UNKNOWN.
            symbol = out.symbol or default_symbol or "UNKNOWN"
            venue = out.venue or "paper"
            return ProposedTrade(
                venue=venue,
                symbol=symbol,
                side="buy",
                order_type="market",
                size=0.0,
                limit_price=None,
                rationale=out.rationale or "hold",
                confidence=out.confidence,
                analyst_id=self.agent_id,
            )

        # action == 'trade': every field must be present and size > 0.
        missing = [
            f for f in ("venue", "symbol", "side", "order_type", "size") if getattr(out, f) is None
        ]
        if missing:
            raise AgentError(f"analyst: action='trade' but missing fields {missing}")
        if out.size is None or out.size <= 0:
            raise AgentError("analyst: action='trade' requires size > 0")
        if out.order_type == "limit" and out.limit_price is None:
            raise AgentError("analyst: limit order requires limit_price")
        if out.confidence <= 0:
            raise AgentError("analyst: action='trade' requires confidence > 0")

        # mypy / type-narrowing: now we know these are not None.
        assert out.venue is not None
        assert out.symbol is not None
        assert out.side is not None
        assert out.order_type is not None
        return ProposedTrade(
            venue=out.venue,
            symbol=out.symbol,
            side=out.side,
            order_type=out.order_type,
            size=float(out.size),
            limit_price=out.limit_price,
            rationale=out.rationale,
            confidence=out.confidence,
            analyst_id=self.agent_id,
        )

    @staticmethod
    def _build_user_prompt(ctx: AgentContext, default_symbol: str | None) -> str:
        snapshot = {
            "default_symbol": default_symbol,
            "tickers": {
                sym: {"mid": t.mid, "bid": t.bid, "ask": t.ask} for sym, t in ctx.tickers.items()
            },
            "positions": [p.model_dump(mode="json") for p in ctx.positions],
            "balances": [b.model_dump(mode="json") for b in ctx.balances],
            "notes": ctx.notes,
        }
        return (
            "Current market snapshot (JSON):\n"
            f"{json.dumps(snapshot, sort_keys=True, default=str)}\n\n"
            "Propose ONE trade in the schema you were given, or return action='hold'."
        )


__all__ = ["AnalystAgent", "AnalystOutput", "ANALYST_SCHEMA"]
