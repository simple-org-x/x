"""Pure risk-check function and supporting types."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from .config import RiskConfig
from .models import AgentContext, ProposedTrade


class RiskLimits(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_notional_usd: float
    max_leverage: float
    symbol_allowlist: list[str] = Field(default_factory=list)
    daily_loss_cap_usd: float
    min_confidence: float = 0.55

    @classmethod
    def from_config(cls, cfg: RiskConfig) -> RiskLimits:
        return cls(
            max_notional_usd=cfg.max_notional_usd,
            max_leverage=cfg.max_leverage,
            symbol_allowlist=list(cfg.symbol_allowlist),
            daily_loss_cap_usd=cfg.daily_loss_cap_usd,
            min_confidence=cfg.min_confidence,
        )


def _reference_price(trade: ProposedTrade, ctx: AgentContext) -> float | None:
    if trade.limit_price is not None:
        return trade.limit_price
    ticker = ctx.tickers.get(trade.symbol)
    if ticker is not None:
        return ticker.mid
    return None


def _daily_realized_pnl(ctx: AgentContext) -> float:
    """Sum a placeholder PnL proxy from execution history.

    .. warning::

        This is a deliberate placeholder. The orchestrator does not yet
        populate ``ctx.history`` between cycles, so in normal operation this
        function returns ``0.0`` and ``daily_loss_cap_usd`` never fires. See
        ``README.md`` and ``docs/architecture.md`` for the TODO.

    The proxy sums ``filled_size * avg_price`` over filled / partial / paper
    reports. ``ExecutionReport.filled_size`` is non-negative for every
    adapter (paper, AsterDex, Hyperliquid all report magnitudes), so this is
    a notional sum, not realised PnL. A future feature will replace this
    with side-aware PnL accounting and persistence across cycles.
    """
    pnl = 0.0
    for report in ctx.history:
        if report.status in {"rejected", "submitted"}:
            continue
        pnl += report.filled_size * report.avg_price
    return pnl


def check_order(
    trade: ProposedTrade,
    ctx: AgentContext,
    limits: RiskLimits,
) -> tuple[bool, str]:
    """Validate ``trade`` against ``limits`` using ``ctx``.

    Returns ``(ok, reason)``. ``ok`` is True only if every check passes; on
    failure ``reason`` describes the first failed check.
    """
    if limits.symbol_allowlist and trade.symbol not in limits.symbol_allowlist:
        return False, f"symbol {trade.symbol} not in allowlist"

    if trade.confidence < limits.min_confidence:
        return (
            False,
            f"confidence {trade.confidence:.3f} below minimum {limits.min_confidence:.3f}",
        )

    price = _reference_price(trade, ctx)
    if price is None:
        return False, f"no reference price for {trade.symbol}"
    notional = abs(trade.size) * price
    if notional > limits.max_notional_usd:
        return (
            False,
            f"notional {notional:.2f} exceeds max {limits.max_notional_usd:.2f}",
        )

    # Leverage: the proposed trade itself doesn't carry leverage, but the
    # current position for that symbol does. If we'd be increasing leverage
    # beyond the cap, reject.
    for position in ctx.positions:
        if position.symbol == trade.symbol and position.leverage > limits.max_leverage:
            return (
                False,
                f"position leverage {position.leverage:.2f} exceeds max {limits.max_leverage:.2f}",
            )

    realized = _daily_realized_pnl(ctx)
    if realized < -limits.daily_loss_cap_usd:
        return (
            False,
            f"daily realized pnl {realized:.2f} below loss cap -{limits.daily_loss_cap_usd:.2f}",
        )

    return True, "ok"


__all__ = ["RiskLimits", "check_order"]
