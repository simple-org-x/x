"""Unit tests for the four agents."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import pytest

from dex_ai_trader.agents import (
    AnalystAgent,
    ExecutorAgent,
    ResponsibleAgent,
    ReviewerAgent,
    sign_trade,
)
from dex_ai_trader.audit import AuditLog
from dex_ai_trader.dex.paper import PaperAdapter
from dex_ai_trader.llm import FakeLLMClient
from dex_ai_trader.models import AgentContext, Balance, Ticker
from dex_ai_trader.risk import RiskLimits


def _ctx_with_ticker(symbol: str = "BTC-USD", mid: float = 30_000.0) -> AgentContext:
    from datetime import UTC, datetime

    return AgentContext(
        tickers={symbol: Ticker(symbol=symbol, mid=mid, bid=mid, ask=mid, ts=datetime.now(tz=UTC))},
        balances=[Balance(asset="USDC", total=100_000.0, available=100_000.0)],
    )


def _wide_limits(symbol: str = "BTC-USD") -> RiskLimits:
    return RiskLimits(
        max_notional_usd=1_000_000.0,
        max_leverage=10.0,
        symbol_allowlist=[symbol],
        daily_loss_cap_usd=1_000_000.0,
        min_confidence=0.0,
    )


# -- Analyst ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_analyst_returns_proposed_trade() -> None:
    llm = FakeLLMClient.always(
        {
            "action": "trade",
            "venue": "paper",
            "symbol": "BTC-USD",
            "side": "buy",
            "order_type": "market",
            "size": 1.0,
            "rationale": "demo",
            "confidence": 0.7,
        }
    )
    agent = AnalystAgent(llm=llm, model="fake")
    proposed = await agent.run(_ctx_with_ticker(), default_symbol="BTC-USD")

    assert proposed.symbol == "BTC-USD"
    assert proposed.side == "buy"
    assert proposed.size == 1.0
    assert proposed.analyst_id == "analyst:fake"


@pytest.mark.asyncio
async def test_analyst_hold_returns_size_zero() -> None:
    llm = FakeLLMClient.always({"action": "hold", "rationale": "no edge"})
    agent = AnalystAgent(llm=llm, model="fake")
    proposed = await agent.run(_ctx_with_ticker(), default_symbol="BTC-USD")

    assert proposed.size == 0.0
    assert proposed.symbol == "BTC-USD"
    assert proposed.rationale == "no edge"


# -- Reviewer --------------------------------------------------------------


@pytest.mark.asyncio
async def test_reviewer_approve_path() -> None:
    analyst_llm = FakeLLMClient.always(
        {
            "action": "trade",
            "venue": "paper",
            "symbol": "BTC-USD",
            "side": "buy",
            "order_type": "market",
            "size": 1.0,
            "rationale": "demo",
            "confidence": 0.7,
        }
    )
    proposed = await AnalystAgent(llm=analyst_llm, model="fake").run(
        _ctx_with_ticker(), default_symbol="BTC-USD"
    )

    reviewer_llm = FakeLLMClient.always({"verdict": "approve", "critique": "ok"})
    reviewer = ReviewerAgent(llm=reviewer_llm, model="fake")
    reviewed = await reviewer.run(proposed, _ctx_with_ticker())

    assert reviewed.verdict == "approve"
    assert reviewed.reviewer_id == "reviewer:fake"
    assert reviewed.amended is None


# -- Responsible -----------------------------------------------------------


@pytest.mark.asyncio
async def test_responsible_approve_signs_and_verifies(tmp_path: Path) -> None:
    analyst_llm = FakeLLMClient.always(
        {
            "action": "trade",
            "venue": "paper",
            "symbol": "BTC-USD",
            "side": "buy",
            "order_type": "market",
            "size": 1.0,
            "rationale": "demo",
            "confidence": 0.7,
        }
    )
    proposed = await AnalystAgent(llm=analyst_llm, model="fake").run(
        _ctx_with_ticker(), default_symbol="BTC-USD"
    )
    reviewed_llm = FakeLLMClient.always({"verdict": "approve", "critique": "ok"})
    reviewed = await ReviewerAgent(llm=reviewed_llm, model="fake").run(proposed, _ctx_with_ticker())

    secret = os.urandom(32)
    audit = AuditLog(path=tmp_path / "audit.jsonl")
    responsible_llm = FakeLLMClient.always({"decision": "approve", "justification": "aligned"})
    responsible = ResponsibleAgent(
        llm=responsible_llm,
        risk_limits=_wide_limits(),
        responsible_secret=secret,
        audit=audit,
        model="fake",
    )
    approved = await responsible.run(reviewed, _ctx_with_ticker())

    assert approved is not None
    assert approved.responsible_id == "responsible:fake"
    expected_sig = sign_trade(
        secret,
        approved.decision_id,
        approved.trade,
        approved.approved_at,
        approved.responsible_id,
    )
    assert approved.signature == expected_sig

    # Round-trip through the executor's verifier.
    paper = PaperAdapter()
    executor = ExecutorAgent(dex=paper, responsible_secret=secret, is_live=False)
    assert executor.verify_signature(approved) is True


@pytest.mark.asyncio
async def test_responsible_veto_returns_none(tmp_path: Path) -> None:
    analyst_llm = FakeLLMClient.always(
        {
            "action": "trade",
            "venue": "paper",
            "symbol": "BTC-USD",
            "side": "buy",
            "order_type": "market",
            "size": 1.0,
            "rationale": "demo",
            "confidence": 0.7,
        }
    )
    proposed = await AnalystAgent(llm=analyst_llm, model="fake").run(
        _ctx_with_ticker(), default_symbol="BTC-USD"
    )
    reviewed_llm = FakeLLMClient.always({"verdict": "approve", "critique": "ok"})
    reviewed = await ReviewerAgent(llm=reviewed_llm, model="fake").run(proposed, _ctx_with_ticker())

    audit = AuditLog(path=tmp_path / "audit.jsonl")
    responsible = ResponsibleAgent(
        llm=FakeLLMClient.always({"decision": "veto", "justification": "no thanks"}),
        risk_limits=_wide_limits(),
        responsible_secret=os.urandom(32),
        audit=audit,
        model="fake",
    )
    approved = await responsible.run(reviewed, _ctx_with_ticker())

    assert approved is None
    contents = (tmp_path / "audit.jsonl").read_text(encoding="utf-8")
    assert "responsible_veto" in contents


@pytest.mark.asyncio
async def test_responsible_risk_block(tmp_path: Path) -> None:
    analyst_llm = FakeLLMClient.always(
        {
            "action": "trade",
            "venue": "paper",
            "symbol": "BTC-USD",
            "side": "buy",
            "order_type": "market",
            "size": 1000.0,
            "rationale": "yolo",
            "confidence": 0.9,
        }
    )
    proposed = await AnalystAgent(llm=analyst_llm, model="fake").run(
        _ctx_with_ticker(), default_symbol="BTC-USD"
    )
    reviewer_llm = FakeLLMClient.always({"verdict": "approve", "critique": "ok"})
    reviewed = await ReviewerAgent(llm=reviewer_llm, model="fake").run(proposed, _ctx_with_ticker())

    tight_limits = RiskLimits(
        max_notional_usd=10.0,  # tiny cap forces risk_block
        max_leverage=10.0,
        symbol_allowlist=["BTC-USD"],
        daily_loss_cap_usd=1_000_000.0,
        min_confidence=0.0,
    )
    audit = AuditLog(path=tmp_path / "audit.jsonl")
    responsible = ResponsibleAgent(
        llm=FakeLLMClient.always({"decision": "approve", "justification": "n/a"}),
        risk_limits=tight_limits,
        responsible_secret=os.urandom(32),
        audit=audit,
        model="fake",
    )
    approved = await responsible.run(reviewed, _ctx_with_ticker())

    assert approved is None
    contents = (tmp_path / "audit.jsonl").read_text(encoding="utf-8")
    assert "risk_block" in contents


# -- Smoke: hold path in analyst short-circuits the rest ------------------


@pytest.mark.asyncio
async def test_hold_path_yields_size_zero() -> None:
    llm = FakeLLMClient.always({"action": "hold", "rationale": "wait"})
    proposed = await AnalystAgent(llm=llm, model="fake").run(
        _ctx_with_ticker(), default_symbol="BTC-USD"
    )
    assert proposed.size == 0


# -- Generic helper to silence unused-import warnings under strict mypy ---


def _silence(_: Any) -> None:  # pragma: no cover
    return None
