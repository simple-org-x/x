"""Executor agent: places ApprovedOrders, refusing tampered signatures."""

from __future__ import annotations

import hmac
import logging
from typing import Any

from ..audit import AuditLog
from ..dex.base import DexAdapter
from ..models import AgentContext, ApprovedOrder, ExecutionReport
from .responsible import sign_trade


class UnauthorizedOrderError(RuntimeError):
    """Raised by :meth:`ExecutorAgent.run` when signature verification fails."""


class ExecutorAgent:
    """Verifies the responsible signature, then places the order via a DEX adapter.

    The orchestrator passes the paper adapter when ``is_live=False`` (dry-run)
    and the live adapter when ``is_live=True``. The executor itself never
    chooses; it just routes.
    """

    name = "executor"

    def __init__(
        self,
        *,
        dex: DexAdapter,
        responsible_secret: bytes,
        is_live: bool = False,
        audit: AuditLog | None = None,
        model: str = "n/a",
        logger: logging.Logger | None = None,
    ) -> None:
        self.dex = dex
        self._secret = responsible_secret
        self.is_live = is_live
        self.audit = audit
        self.model = model
        self.logger = logger if logger is not None else logging.getLogger("agent.executor")

    @property
    def agent_id(self) -> str:
        return f"executor:{self.dex.name}"

    def verify_signature(self, approved: ApprovedOrder) -> bool:
        """Return True iff the HMAC over the canonical payload matches."""
        expected = sign_trade(
            self._secret,
            approved.decision_id,
            approved.trade,
            approved.approved_at,
        )
        return hmac.compare_digest(expected, approved.signature)

    async def run(
        self,
        approved: ApprovedOrder,
        ctx: AgentContext | None = None,
    ) -> ExecutionReport:
        if not self.verify_signature(approved):
            self._audit(
                "executor_unauthorized",
                {
                    "decision_id": str(approved.decision_id),
                    "reason": "signature_mismatch",
                },
            )
            raise UnauthorizedOrderError(
                f"signature verification failed for decision_id={approved.decision_id}"
            )

        try:
            report = await self.dex.place_order(approved)
        except Exception as exc:  # noqa: BLE001 - never crash the loop on adapter errors
            self.logger.exception("dex.place_order raised")
            self._audit(
                "executor_live_result" if self.is_live else "executor_paper_fill",
                {
                    "decision_id": str(approved.decision_id),
                    "status": "rejected",
                    "error": str(exc),
                    "trade": approved.trade.model_dump(mode="json"),
                },
            )
            raise

        event = "executor_live_result" if self.is_live else "executor_paper_fill"
        self._audit(
            event,
            {
                "decision_id": str(approved.decision_id),
                "status": report.status,
                "filled_size": report.filled_size,
                "avg_price": report.avg_price,
                "exchange_order_id": report.exchange_order_id,
                "error": report.error,
                "trade": approved.trade.model_dump(mode="json"),
            },
        )
        return report

    def _audit(self, event: str, payload: dict[str, Any]) -> None:
        if self.audit is not None:
            self.audit.append(event, payload)


__all__ = ["ExecutorAgent", "UnauthorizedOrderError"]
