"""Multi-agent system: Analyst -> Reviewer -> Responsible -> Executor.

The :class:`ResponsibleAgent` is the SOLE authority that mints
:class:`~dex_ai_trader.models.ApprovedOrder` instances; it signs the canonical
JSON of the trade with HMAC-SHA256 and a per-process secret. The
:class:`ExecutorAgent` recomputes the same HMAC and refuses any order whose
signature does not match by raising :class:`UnauthorizedOrderError`. This
guarantees that Analyst or Reviewer outputs alone cannot reach the exchange.
"""

from __future__ import annotations

from .analyst import AnalystAgent, AnalystOutput
from .base import Agent, AgentError
from .executor import ExecutorAgent, UnauthorizedOrderError
from .responsible import (
    ResponsibleAgent,
    ResponsibleOutput,
    canonical_payload,
    load_or_generate_responsible_secret,
    sign_trade,
)
from .reviewer import ReviewerAgent, ReviewerOutput

__all__ = [
    "Agent",
    "AgentError",
    "AnalystAgent",
    "AnalystOutput",
    "ExecutorAgent",
    "ResponsibleAgent",
    "ResponsibleOutput",
    "ReviewerAgent",
    "ReviewerOutput",
    "UnauthorizedOrderError",
    "canonical_payload",
    "load_or_generate_responsible_secret",
    "sign_trade",
]
