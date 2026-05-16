"""Executor agent: places ApprovedOrders, refusing tampered or stale signatures."""

from __future__ import annotations

import hmac
import logging
from collections import OrderedDict
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from ..audit import AuditLog
from ..dex.base import DexAdapter
from ..models import AgentContext, ApprovedOrder, ExecutionReport
from .responsible import sign_trade

DEFAULT_FRESHNESS_WINDOW_S = 60.0
DEFAULT_SEEN_DECISION_CAPACITY = 1024


class UnauthorizedOrderError(RuntimeError):
    """Raised by :meth:`ExecutorAgent.run` when an order fails authorization.

    Authorization covers three independent checks:

    * HMAC signature verification (``verify_signature``).
    * ``approved_at`` freshness (no older than ``freshness_window_s`` seconds).
    * ``decision_id`` uniqueness within this process's lifetime (LRU set).
    """


class ExecutorAgent:
    """Verifies the responsible signature, then places the order via a DEX adapter.

    The orchestrator passes the paper adapter when ``is_live=False`` (dry-run)
    and the live adapter when ``is_live=True``. The executor itself never
    chooses; it just routes.

    Replay protection:

    * ``approved_at`` must be no older than ``freshness_window_s`` seconds
      (default 60) compared to the executor's clock.
    * Each ``decision_id`` is recorded in an in-process LRU set; subsequent
      submissions of the same id are refused. This survives only the lifetime
      of the executor instance, which matches the threat model: the audit log
      is the durable system of record.
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
        freshness_window_s: float = DEFAULT_FRESHNESS_WINDOW_S,
        seen_decision_capacity: int = DEFAULT_SEEN_DECISION_CAPACITY,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.dex = dex
        self._secret = responsible_secret
        self.is_live = is_live
        self.audit = audit
        self.model = model
        self.logger = logger if logger is not None else logging.getLogger("agent.executor")
        self.freshness_window_s = float(freshness_window_s)
        self._seen_decision_capacity = int(seen_decision_capacity)
        self._seen_decisions: OrderedDict[UUID, None] = OrderedDict()
        self._clock = clock if clock is not None else _utc_now

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
            approved.responsible_id,
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

        # Freshness check: refuse stale ApprovedOrders. ``approved_at`` is
        # constructed in UTC by the responsible agent; the executor's clock is
        # also UTC.
        now = self._clock()
        age_s = (now - approved.approved_at).total_seconds()
        if age_s > self.freshness_window_s:
            self._audit(
                "executor_unauthorized",
                {
                    "decision_id": str(approved.decision_id),
                    "reason": "stale_approval",
                    "age_s": age_s,
                    "freshness_window_s": self.freshness_window_s,
                },
            )
            raise UnauthorizedOrderError(
                f"approved_at is {age_s:.1f}s old, exceeds freshness window "
                f"of {self.freshness_window_s:.1f}s for "
                f"decision_id={approved.decision_id}"
            )

        # Replay check: refuse decision_ids we've already accepted in this
        # process's lifetime.
        if approved.decision_id in self._seen_decisions:
            self._audit(
                "executor_unauthorized",
                {
                    "decision_id": str(approved.decision_id),
                    "reason": "replayed_decision_id",
                },
            )
            raise UnauthorizedOrderError(
                f"decision_id={approved.decision_id} has already been processed; " "refusing replay"
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

        # Record only after successful place_order so a transient adapter
        # failure does not poison subsequent retries with the same decision_id.
        self._record_decision(approved.decision_id)

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

    def _record_decision(self, decision_id: UUID) -> None:
        self._seen_decisions[decision_id] = None
        while len(self._seen_decisions) > self._seen_decision_capacity:
            self._seen_decisions.popitem(last=False)

    def _audit(self, event: str, payload: dict[str, Any]) -> None:
        if self.audit is not None:
            self.audit.append(event, payload)


def _utc_now() -> datetime:
    return datetime.now(tz=UTC)


__all__ = [
    "ExecutorAgent",
    "UnauthorizedOrderError",
    "DEFAULT_FRESHNESS_WINDOW_S",
    "DEFAULT_SEEN_DECISION_CAPACITY",
]
