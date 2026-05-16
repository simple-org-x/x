"""Reviewer agent: independent risk-aware critic of the analyst's trade.

Output schema (JSON):

    {
      "verdict": "approve" | "reject" | "amend",
      "critique": "<reasoning>",
      "amended": { ... full ProposedTrade dict ... }   # required when verdict=='amend'
    }
"""

from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, model_validator

from ..models import AgentContext, ProposedTrade, ReviewedTrade
from .base import Agent

REVIEWER_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": ["approve", "reject", "amend"]},
        "critique": {"type": "string"},
        "amended": {"type": "object"},
    },
    "required": ["verdict", "critique"],
}


class ReviewerOutput(BaseModel):
    """Validated reviewer response. ``amended`` is required when verdict='amend'."""

    model_config = ConfigDict(extra="forbid")

    verdict: Literal["approve", "reject", "amend"]
    critique: str
    amended: ProposedTrade | None = None

    @model_validator(mode="after")
    def _amended_required_for_amend(self) -> ReviewerOutput:
        if self.verdict == "amend" and self.amended is None:
            raise ValueError("verdict='amend' requires a fully populated 'amended' trade")
        return self


class ReviewerAgent(Agent):
    """Critiques the analyst's proposal."""

    name = "reviewer"

    SYSTEM_PROMPT = (
        "You are an independent, risk-aware Reviewer. The Analyst has proposed a trade. "
        "Your job is to critique it and return STRICT JSON with: verdict in "
        "{'approve','reject','amend'}, critique (free text), and - only when verdict='amend' - "
        "an 'amended' object with the FULL ProposedTrade fields (venue, symbol, side, "
        "order_type, size>0, rationale, confidence in [0,1], analyst_id)."
    )

    async def run(self, proposed: ProposedTrade, ctx: AgentContext) -> ReviewedTrade:
        user_prompt = (
            "Proposed trade (JSON):\n"
            f"{proposed.model_dump_json()}\n\n"
            "Context snapshot (JSON):\n"
            f"{json.dumps(_summarise_ctx(ctx), sort_keys=True, default=str)}\n\n"
            "Return your critique JSON now."
        )
        out = await self._ask_llm(
            system_prompt=self.SYSTEM_PROMPT,
            user_prompt=user_prompt,
            schema=REVIEWER_SCHEMA,
            output_model=ReviewerOutput,
        )

        return ReviewedTrade(
            proposed=proposed,
            verdict=out.verdict,
            critique=out.critique,
            amended=out.amended,
            reviewer_id=self.agent_id,
        )


def _summarise_ctx(ctx: AgentContext) -> dict[str, Any]:
    return {
        "tickers": {
            sym: {"mid": t.mid, "bid": t.bid, "ask": t.ask} for sym, t in ctx.tickers.items()
        },
        "positions": [p.model_dump(mode="json") for p in ctx.positions],
        "balances": [b.model_dump(mode="json") for b in ctx.balances],
    }


__all__ = ["ReviewerAgent", "ReviewerOutput", "REVIEWER_SCHEMA"]
