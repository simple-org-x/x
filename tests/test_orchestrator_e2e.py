"""End-to-end orchestrator test: FakeLLM + PaperAdapter, no network."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from dex_ai_trader.audit import AuditLog
from dex_ai_trader.config import (
    AppConfig,
    CredentialsConfig,
    LLMConfig,
    RiskConfig,
    RunConfig,
    VenueConfig,
)
from dex_ai_trader.dex.paper import PaperAdapter
from dex_ai_trader.llm import FakeLLMClient
from dex_ai_trader.models import Market
from dex_ai_trader.orchestrator import TradingLoop


def _read_events(path: Path) -> list[str]:
    events: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        record = json.loads(line)
        events.append(record["event"])
    return events


def _read_records(path: Path) -> list[dict]:
    out: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        out.append(json.loads(line))
    return out


@pytest.mark.asyncio
async def test_full_cycle_paper_fill(tmp_path: Path) -> None:
    symbol = "BTC-USD"
    mark_price = 30_000.0

    paper = PaperAdapter(
        initial_cash=100_000.0,
        mark_price=lambda _s: mark_price,
        markets=[
            Market(
                symbol=symbol,
                base="BTC",
                quote="USD",
                venue="paper",
                min_size=0.0001,
                price_precision=2,
            )
        ],
    )

    llm = FakeLLMClient.from_sequence(
        [
            {
                "action": "trade",
                "venue": "paper",
                "symbol": symbol,
                "side": "buy",
                "order_type": "market",
                "size": 0.001,
                "rationale": "demo",
                "confidence": 0.8,
            },
            {"verdict": "approve", "critique": "looks fine"},
            {"decision": "approve", "justification": "aligned"},
        ]
    )

    cfg = AppConfig(
        llm=LLMConfig(provider="fake", model="fake"),
        venue=VenueConfig(name="paper", testnet=True),
        risk=RiskConfig(
            max_notional_usd=1_000_000.0,
            max_leverage=10.0,
            symbol_allowlist=[symbol],
            daily_loss_cap_usd=1_000_000.0,
            min_confidence=0.0,
        ),
        run=RunConfig(symbols=[symbol], dry_run=True, live=False),
        credentials=CredentialsConfig(live=False),
    )

    audit_path = tmp_path / "audit.jsonl"
    audit = AuditLog(path=audit_path)

    loop = TradingLoop(
        config=cfg,
        dex_live=paper,
        dex_paper=paper,
        llm=llm,
        audit=audit,
        responsible_secret=os.urandom(32),
    )

    report = await loop.run_cycle(symbol)

    assert report is not None
    assert report.status == "paper"
    assert report.filled_size == 0.001
    assert report.avg_price == mark_price

    events = _read_events(audit_path)
    expected = [
        "cycle_start",
        "analyst",
        "reviewer",
        "responsible_approve",
        "executor_paper_fill",
        "cycle_complete",
    ]
    # All expected events appear in the right order (others may interleave but
    # for this happy path nothing else does).
    assert events == expected, events

    # decision_id correlation: the responsible_approve, executor_paper_fill,
    # and cycle_complete records all carry the same decision_id.
    records = _read_records(audit_path)
    by_event = {rec["event"]: rec for rec in records}
    decision_id = by_event["responsible_approve"]["payload"]["decision_id"]
    assert by_event["executor_paper_fill"]["payload"]["decision_id"] == decision_id
    assert by_event["cycle_complete"]["payload"]["decision_id"] == decision_id


@pytest.mark.asyncio
async def test_hold_path_skips_reviewer(tmp_path: Path) -> None:
    paper = PaperAdapter(
        markets=[
            Market(
                symbol="BTC-USD",
                base="BTC",
                quote="USD",
                venue="paper",
                min_size=0.0001,
                price_precision=2,
            )
        ]
    )
    llm = FakeLLMClient.from_sequence([{"action": "hold", "rationale": "wait"}])

    cfg = AppConfig(
        llm=LLMConfig(provider="fake", model="fake"),
        venue=VenueConfig(name="paper", testnet=True),
        risk=RiskConfig(
            max_notional_usd=1_000_000.0,
            max_leverage=10.0,
            symbol_allowlist=["BTC-USD"],
            daily_loss_cap_usd=1_000_000.0,
            min_confidence=0.0,
        ),
        run=RunConfig(symbols=["BTC-USD"], dry_run=True, live=False),
        credentials=CredentialsConfig(live=False),
    )

    audit_path = tmp_path / "audit.jsonl"
    audit = AuditLog(path=audit_path)
    loop = TradingLoop(
        config=cfg,
        dex_live=paper,
        dex_paper=paper,
        llm=llm,
        audit=audit,
        responsible_secret=os.urandom(32),
    )

    report = await loop.run_cycle("BTC-USD")
    assert report is None

    events = _read_events(audit_path)
    assert events == ["cycle_start", "analyst", "no_trade", "cycle_complete"]
