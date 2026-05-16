"""Executor signature verification tests."""

from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from dex_ai_trader.agents import (
    AnalystAgent,
    ExecutorAgent,
    ResponsibleAgent,
    ReviewerAgent,
    UnauthorizedOrderError,
)
from dex_ai_trader.audit import AuditLog
from dex_ai_trader.dex.paper import PaperAdapter
from dex_ai_trader.llm import FakeLLMClient
from dex_ai_trader.models import AgentContext, Balance, Ticker
from dex_ai_trader.risk import RiskLimits


def _ctx() -> AgentContext:
    return AgentContext(
        tickers={
            "BTC-USD": Ticker(
                symbol="BTC-USD",
                mid=30_000.0,
                bid=30_000.0,
                ask=30_000.0,
                ts=datetime.now(tz=UTC),
            )
        },
        balances=[Balance(asset="USDC", total=100_000.0, available=100_000.0)],
    )


async def _build_approved(secret: bytes, audit: AuditLog):
    """Drive the agents to produce a real ApprovedOrder signed with ``secret``."""
    analyst_llm = FakeLLMClient.always(
        {
            "action": "trade",
            "venue": "paper",
            "symbol": "BTC-USD",
            "side": "buy",
            "order_type": "market",
            "size": 0.001,
            "rationale": "demo",
            "confidence": 0.8,
        }
    )
    reviewer_llm = FakeLLMClient.always({"verdict": "approve", "critique": "ok"})
    responsible_llm = FakeLLMClient.always({"decision": "approve", "justification": "ok"})

    proposed = await AnalystAgent(llm=analyst_llm, model="fake").run(
        _ctx(), default_symbol="BTC-USD"
    )
    reviewed = await ReviewerAgent(llm=reviewer_llm, model="fake").run(proposed, _ctx())
    responsible = ResponsibleAgent(
        llm=responsible_llm,
        risk_limits=RiskLimits(
            max_notional_usd=1_000_000.0,
            max_leverage=10.0,
            symbol_allowlist=["BTC-USD"],
            daily_loss_cap_usd=1_000_000.0,
            min_confidence=0.0,
        ),
        responsible_secret=secret,
        audit=audit,
        model="fake",
    )
    approved = await responsible.run(reviewed, _ctx())
    assert approved is not None
    return approved


@pytest.mark.asyncio
async def test_valid_signature_places_order(tmp_path: Path) -> None:
    secret = os.urandom(32)
    audit = AuditLog(path=tmp_path / "audit.jsonl")
    approved = await _build_approved(secret, audit)

    paper = PaperAdapter()
    paper.place_order = AsyncMock(wraps=paper.place_order)  # type: ignore[method-assign]
    executor = ExecutorAgent(dex=paper, responsible_secret=secret, is_live=False, audit=audit)

    assert executor.verify_signature(approved) is True
    report = await executor.run(approved)
    assert report.status == "paper"
    assert paper.place_order.await_count == 1


@pytest.mark.asyncio
async def test_tampered_signature_is_rejected(tmp_path: Path) -> None:
    secret = os.urandom(32)
    audit = AuditLog(path=tmp_path / "audit.jsonl")
    approved = await _build_approved(secret, audit)

    # Tamper with the trade after the fact (model_copy) - signature is now invalid.
    tampered = approved.model_copy(
        update={"trade": approved.trade.model_copy(update={"size": approved.trade.size * 1000.0})}
    )

    paper = PaperAdapter()
    spy = AsyncMock(wraps=paper.place_order)
    paper.place_order = spy  # type: ignore[method-assign]

    executor = ExecutorAgent(dex=paper, responsible_secret=secret, is_live=False, audit=audit)

    assert executor.verify_signature(tampered) is False

    with pytest.raises(UnauthorizedOrderError):
        await executor.run(tampered)

    # The adapter MUST NOT have been called.
    assert spy.await_count == 0
    assert spy.call_count == 0
