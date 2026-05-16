"""Responsible agent: the SOLE authority that mints :class:`ApprovedOrder`.

Workflow for ``run(reviewed, ctx)``:

1. Deterministic Python checks first:
   * If the reviewer rejected the trade or the candidate has ``size==0``,
     return ``None`` (no order, audit-logged as 'no_trade'/'responsible_veto').
   * Compute the candidate trade: ``reviewed.amended`` when verdict='amend',
     else ``reviewed.proposed``.
   * Run :func:`risk.check_order`. If it fails, return ``None`` and append a
     'risk_block' audit event.
2. Ask the LLM for a final go/no-go (schema below). On 'veto' return ``None``.
3. On 'approve' construct an :class:`ApprovedOrder` with a fresh
   ``decision_id``, ``approved_at=utcnow``, and ``signature = HMAC-SHA256
   (responsible_secret, canonical_json(decision_id, trade, approved_at)).hex()``.

The HMAC secret is loaded from the credential store under venue
``'responsible'`` with the hex-encoded secret stashed in
``CredentialRecord.extra['hmac_secret']``. If absent on first run, a fresh
``os.urandom(32)`` is generated and persisted using the same passphrase the
user used to unlock.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from ..audit import AuditLog
from ..credentials import CredentialRecord, CredentialStore, CredentialStoreError
from ..models import AgentContext, ApprovedOrder, ProposedTrade, ReviewedTrade
from ..risk import RiskLimits, check_order
from .base import Agent

RESPONSIBLE_VENUE = "responsible"
RESPONSIBLE_SECRET_KEY = "hmac_secret"
RESPONSIBLE_SECRET_BYTES = 32

RESPONSIBLE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "decision": {"type": "string", "enum": ["approve", "veto"]},
        "justification": {"type": "string"},
    },
    "required": ["decision", "justification"],
}


class ResponsibleOutput(BaseModel):
    """Validated responsible-agent LLM response."""

    model_config = ConfigDict(extra="forbid")

    decision: Literal["approve", "veto"]
    justification: str


# -- canonicalisation + signing --------------------------------------------


def canonical_payload(
    decision_id: uuid.UUID,
    trade: ProposedTrade,
    approved_at: datetime,
    responsible_id: str,
) -> bytes:
    """Stable canonical JSON for ``(decision_id, trade, approved_at, responsible_id)``.

    Uses ``json.dumps(..., sort_keys=True, separators=(',', ':'), default=str)``
    so the executor and the responsible agent always serialise identically.

    Binding ``responsible_id`` into the signature ensures an attacker cannot
    take a captured ``ApprovedOrder`` and replay it with a swapped
    ``responsible_id``: any change invalidates the HMAC.
    """
    payload = {
        "decision_id": str(decision_id),
        "trade": trade.model_dump(mode="json"),
        "approved_at": approved_at.isoformat(),
        "responsible_id": responsible_id,
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")


def sign_trade(
    secret: bytes,
    decision_id: uuid.UUID,
    trade: ProposedTrade,
    approved_at: datetime,
    responsible_id: str,
) -> str:
    """Return the hex HMAC-SHA256 signature for the canonical payload.

    The payload covers ``decision_id``, the full ``trade`` dump,
    ``approved_at``, and ``responsible_id``; see :func:`canonical_payload`.
    """
    payload = canonical_payload(decision_id, trade, approved_at, responsible_id)
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()


# -- secret loading ---------------------------------------------------------


def load_or_generate_responsible_secret(
    store: CredentialStore,
    passphrase: str,
) -> bytes:
    """Load the HMAC secret from ``store``, generating + persisting if absent.

    Requires the store to already exist on disk (i.e. the user has run
    ``dex-ai-trader connect <venue>`` at least once). If the store file is
    missing, raises :class:`CredentialStoreError`: silently bootstrapping a
    fresh store from the supplied passphrase risks writing the secret under a
    typo'd passphrase that the user cannot reproduce on the next run.

    The secret is stored hex-encoded in
    ``CredentialRecord.extra['hmac_secret']`` under venue ``'responsible'`` so
    the existing credential schema can accommodate it without changes.
    """
    if not store.exists():
        raise CredentialStoreError(
            "credential store does not exist; run 'dex-ai-trader connect <venue>' "
            "at least once before invoking 'run' so the responsible HMAC secret "
            "is not bootstrapped under an unverified passphrase"
        )
    if not store.is_unlocked():
        store.unlock(passphrase)

    record = store.get(RESPONSIBLE_VENUE)
    if record is not None:
        hex_secret = record.extra.get(RESPONSIBLE_SECRET_KEY)
        if hex_secret:
            try:
                secret = bytes.fromhex(hex_secret)
            except ValueError as exc:
                raise ValueError("responsible secret is not valid hex") from exc
            if len(secret) != RESPONSIBLE_SECRET_BYTES:
                raise ValueError(
                    f"responsible secret must be {RESPONSIBLE_SECRET_BYTES} bytes, "
                    f"got {len(secret)}"
                )
            return secret

    # Generate a fresh secret and persist it.
    secret = os.urandom(RESPONSIBLE_SECRET_BYTES)
    new_record = CredentialRecord(
        venue=RESPONSIBLE_VENUE,
        extra={RESPONSIBLE_SECRET_KEY: secret.hex()},
    )
    store.put(new_record, passphrase=passphrase)
    return secret


# -- the agent --------------------------------------------------------------


class ResponsibleAgent(Agent):
    """The final gate. Only this class constructs :class:`ApprovedOrder`."""

    name = "responsible"

    SYSTEM_PROMPT = (
        "You are the Responsible decision-maker. The Analyst proposed a trade and the "
        "Reviewer critiqued it. Risk limits have already been checked in code. Your job "
        "is to weigh both perspectives and return STRICT JSON: {decision: 'approve' | "
        "'veto', justification: '<reasoning>'}. Veto if the trade is unsafe or the "
        "rationale is weak."
    )

    def __init__(
        self,
        *,
        llm: Any,
        risk_limits: RiskLimits,
        responsible_secret: bytes,
        audit: AuditLog | None = None,
        model: str = "fake-model",
        logger: Any = None,
    ) -> None:
        super().__init__(llm=llm, model=model, logger=logger)
        if len(responsible_secret) != RESPONSIBLE_SECRET_BYTES:
            raise ValueError(
                f"responsible_secret must be {RESPONSIBLE_SECRET_BYTES} bytes; "
                f"got {len(responsible_secret)}"
            )
        self.risk_limits = risk_limits
        self._secret = responsible_secret
        self.audit = audit

    async def run(
        self,
        reviewed: ReviewedTrade,
        ctx: AgentContext,
    ) -> ApprovedOrder | None:
        # Step 1: deterministic gate.
        if reviewed.verdict == "reject":
            self._audit("responsible_veto", {"reason": "reviewer_rejected"})
            return None

        candidate: ProposedTrade = (
            reviewed.amended
            if reviewed.verdict == "amend" and reviewed.amended is not None
            else reviewed.proposed
        )

        if candidate.size == 0:
            self._audit("no_trade", {"reason": "size_zero"})
            return None

        ok, reason = check_order(candidate, ctx, self.risk_limits)
        if not ok:
            self._audit(
                "risk_block",
                {"reason": reason, "trade": candidate.model_dump(mode="json")},
            )
            return None

        # Step 2: ask the LLM for the final go/no-go.
        user_prompt = (
            "Proposed trade (JSON):\n"
            f"{candidate.model_dump_json()}\n\n"
            f"Reviewer verdict: {reviewed.verdict}\n"
            f"Reviewer critique: {reviewed.critique}\n\n"
            "Risk checks passed. Decide approve or veto and return strict JSON."
        )
        try:
            out = await self._ask_llm(
                system_prompt=self.SYSTEM_PROMPT,
                user_prompt=user_prompt,
                schema=RESPONSIBLE_SCHEMA,
                output_model=ResponsibleOutput,
            )
        except Exception as exc:  # noqa: BLE001 - never let a bug place an order
            self.logger.exception("responsible LLM call failed")
            self._audit(
                "responsible_veto",
                {"reason": "llm_error", "error": str(exc)},
            )
            return None

        if out.decision == "veto":
            self._audit(
                "responsible_veto",
                {"reason": "llm_veto", "justification": out.justification},
            )
            return None

        # Step 3: mint the ApprovedOrder.
        decision_id = uuid.uuid4()
        approved_at = datetime.now(tz=UTC)
        signature = sign_trade(self._secret, decision_id, candidate, approved_at, self.agent_id)
        approved = ApprovedOrder(
            trade=candidate,
            decision_id=decision_id,
            approved_at=approved_at,
            responsible_id=self.agent_id,
            signature=signature,
        )
        self._audit(
            "responsible_approve",
            {
                "decision_id": str(decision_id),
                "justification": out.justification,
                "trade": candidate.model_dump(mode="json"),
            },
        )
        return approved

    def _audit(self, event: str, payload: dict[str, Any]) -> None:
        if self.audit is not None:
            self.audit.append(event, payload)


__all__ = [
    "ResponsibleAgent",
    "ResponsibleOutput",
    "RESPONSIBLE_SCHEMA",
    "RESPONSIBLE_VENUE",
    "RESPONSIBLE_SECRET_KEY",
    "RESPONSIBLE_SECRET_BYTES",
    "canonical_payload",
    "sign_trade",
    "load_or_generate_responsible_secret",
]
