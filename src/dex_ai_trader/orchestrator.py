"""TradingLoop: runs Analyst -> Reviewer -> Responsible -> Executor.

The loop is async-first. Use :meth:`TradingLoop.run_cycle` for a single
decision cycle (typically called by ``dex-ai-trader run --once``) or
:meth:`TradingLoop.run_forever` for a polling loop with graceful shutdown on
SIGINT/SIGTERM.

The orchestrator routes the executor at the adapter level: when
``config.run.live`` is False, the executor receives the paper adapter and
``is_live=False``; otherwise it receives the live adapter and ``is_live=True``.
This is the single place where that decision is made.
"""

from __future__ import annotations

import asyncio
import logging
import signal

from .agents import (
    AnalystAgent,
    ExecutorAgent,
    ResponsibleAgent,
    ReviewerAgent,
)
from .audit import AuditLog
from .config import AppConfig
from .dex.base import DexAdapter
from .dex.paper import PaperAdapter
from .llm.base import LLMClient
from .models import AgentContext, ExecutionReport
from .risk import RiskLimits


class TradingLoop:
    """Owns the four agents and the chosen DEX adapter."""

    def __init__(
        self,
        *,
        config: AppConfig,
        dex_live: DexAdapter,
        dex_paper: PaperAdapter,
        llm: LLMClient,
        audit: AuditLog,
        responsible_secret: bytes,
        logger: logging.Logger | None = None,
    ) -> None:
        self.config = config
        self.dex_live = dex_live
        self.dex_paper = dex_paper
        self.llm = llm
        self.audit = audit
        self.logger = logger if logger is not None else logging.getLogger("orchestrator")

        risk_limits = RiskLimits.from_config(config.risk)

        self.analyst = AnalystAgent(llm=llm, model=config.llm.model)
        self.reviewer = ReviewerAgent(llm=llm, model=config.llm.model)
        self.responsible = ResponsibleAgent(
            llm=llm,
            risk_limits=risk_limits,
            responsible_secret=responsible_secret,
            audit=audit,
            model=config.llm.model,
        )

        is_live = bool(config.run.live)
        executor_dex: DexAdapter = dex_live if is_live else dex_paper
        self.executor = ExecutorAgent(
            dex=executor_dex,
            responsible_secret=responsible_secret,
            is_live=is_live,
            audit=audit,
        )

        self._stop_event = asyncio.Event()

    # -- single cycle -----------------------------------------------------

    async def gather_context(self, symbol: str) -> AgentContext:
        """Snapshot markets, ticker, positions and balances from the live adapter."""
        markets = await self.dex_live.get_markets()
        ticker = await self.dex_live.get_ticker(symbol)
        positions = await self.dex_live.get_positions()
        balances = await self.dex_live.get_balances()
        return AgentContext(
            markets=markets,
            tickers={symbol: ticker},
            positions=positions,
            balances=balances,
            history=[],
            notes="",
        )

    async def run_cycle(self, symbol: str) -> ExecutionReport | None:
        """Run one Analyst -> Reviewer -> Responsible -> Executor cycle.

        Returns the :class:`ExecutionReport` when an order was placed, else
        ``None`` (hold, reject, risk-block, or veto).
        """
        self.audit.append("cycle_start", {"symbol": symbol, "live": self.config.run.live})

        try:
            ctx = await self.gather_context(symbol)
        except Exception as exc:  # noqa: BLE001
            self.logger.exception("context gathering failed")
            self.audit.append("cycle_error", {"phase": "gather_context", "error": str(exc)})
            self.audit.append("cycle_complete", {"symbol": symbol, "outcome": "error"})
            return None

        # -- Analyst --
        try:
            proposed = await self.analyst.run(ctx, default_symbol=symbol)
        except Exception as exc:  # noqa: BLE001
            self.logger.exception("analyst failed")
            self.audit.append("cycle_error", {"phase": "analyst", "error": str(exc)})
            self.audit.append("cycle_complete", {"symbol": symbol, "outcome": "error"})
            return None

        self.audit.append(
            "analyst",
            {
                "symbol": proposed.symbol,
                "trade": proposed.model_dump(mode="json"),
            },
        )

        # Hold semantics: skip the reviewer entirely.
        if proposed.size == 0:
            self.audit.append(
                "no_trade",
                {"symbol": proposed.symbol, "reason": "analyst_hold"},
            )
            self.audit.append("cycle_complete", {"symbol": symbol, "outcome": "hold"})
            return None

        # -- Reviewer --
        try:
            reviewed = await self.reviewer.run(proposed, ctx)
        except Exception as exc:  # noqa: BLE001
            self.logger.exception("reviewer failed")
            self.audit.append("cycle_error", {"phase": "reviewer", "error": str(exc)})
            self.audit.append("cycle_complete", {"symbol": symbol, "outcome": "error"})
            return None

        self.audit.append(
            "reviewer",
            {
                "verdict": reviewed.verdict,
                "critique": reviewed.critique,
                "amended": (reviewed.amended.model_dump(mode="json") if reviewed.amended else None),
            },
        )

        # -- Responsible --
        try:
            approved = await self.responsible.run(reviewed, ctx)
        except Exception as exc:  # noqa: BLE001
            self.logger.exception("responsible failed")
            self.audit.append("cycle_error", {"phase": "responsible", "error": str(exc)})
            self.audit.append("cycle_complete", {"symbol": symbol, "outcome": "error"})
            return None

        if approved is None:
            # ResponsibleAgent already audited the specific reason
            # (responsible_veto / risk_block / no_trade).
            self.audit.append(
                "cycle_complete",
                {"symbol": symbol, "outcome": "no_order"},
            )
            return None

        # -- Executor --
        try:
            report = await self.executor.run(approved, ctx)
        except Exception as exc:  # noqa: BLE001
            self.logger.exception("executor failed")
            self.audit.append(
                "cycle_error",
                {
                    "phase": "executor",
                    "error": str(exc),
                    "decision_id": str(approved.decision_id),
                },
            )
            self.audit.append("cycle_complete", {"symbol": symbol, "outcome": "executor_error"})
            return None

        self.audit.append(
            "cycle_complete",
            {
                "symbol": symbol,
                "outcome": "placed",
                "decision_id": str(approved.decision_id),
                "status": report.status,
            },
        )
        return report

    # -- continuous loop --------------------------------------------------

    async def run_forever(self) -> None:
        """Poll ``config.run.symbols`` every ``config.run.poll_interval_s`` seconds.

        Catches all per-cycle exceptions, audit-logs them as 'cycle_error', and
        keeps going. Exits cleanly on SIGINT/SIGTERM (or when an external caller
        sets the stop event).
        """
        self._install_signal_handlers()
        symbols = list(self.config.run.symbols) or ["BTC-USD"]
        interval = max(0.0, float(self.config.run.poll_interval_s))

        while not self._stop_event.is_set():
            for symbol in symbols:
                if self._stop_event.is_set():
                    break
                try:
                    await self.run_cycle(symbol)
                except Exception as exc:  # noqa: BLE001
                    self.logger.exception("cycle raised")
                    self.audit.append(
                        "cycle_error",
                        {"phase": "loop", "symbol": symbol, "error": str(exc)},
                    )

            if self._stop_event.is_set() or interval <= 0:
                break
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=interval)
            except TimeoutError:
                continue

    def request_stop(self) -> None:
        self._stop_event.set()

    def _install_signal_handlers(self) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:  # pragma: no cover - defensive
            return
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, self.request_stop)
            except (NotImplementedError, RuntimeError):  # pragma: no cover - Windows / pytest
                # Signal handlers aren't always installable (e.g. when not the main
                # thread); the caller can still stop us via request_stop().
                continue


__all__ = ["TradingLoop"]
