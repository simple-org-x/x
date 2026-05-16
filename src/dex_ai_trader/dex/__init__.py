"""DEX adapter package.

Re-exports the abstract :class:`DexAdapter` base class plus the three concrete
adapters and the :func:`build_adapter` factory used by the orchestrator.

The optional ``hyperliquid`` extra is imported lazily inside the
:class:`HyperliquidAdapter` constructor; this module imports cleanly even when
the SDK is not installed.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from ..credentials import CredentialRecord
from .asterdex_adapter import AsterDexAdapter
from .base import DexAdapter
from .hyperliquid_adapter import HyperliquidAdapter
from .paper import PaperAdapter

if TYPE_CHECKING:
    from ..config import VenueConfig


def build_adapter(
    venue: str,
    config: VenueConfig | None = None,
    credentials: CredentialRecord | None = None,
    **kwargs: Any,
) -> DexAdapter:
    """Return the right adapter for ``venue``.

    Raises ``ValueError`` with a clear message naming any missing fields so the
    CLI can surface a useful error before any network is touched.
    """
    venue_norm = venue.lower()
    testnet = bool(getattr(config, "testnet", True)) if config is not None else True

    if venue_norm == "paper":
        return PaperAdapter(**kwargs)

    if venue_norm == "asterdex":
        missing: list[str] = []
        if credentials is None or not credentials.api_key:
            missing.append("api_key")
        if credentials is None or not credentials.api_secret:
            missing.append("api_secret")
        if missing:
            raise ValueError("AsterDex adapter requires credentials with: " + ", ".join(missing))
        assert credentials is not None  # for type checkers
        assert credentials.api_key is not None
        assert credentials.api_secret is not None
        return AsterDexAdapter(
            api_key=credentials.api_key,
            api_secret=credentials.api_secret,
            testnet=testnet,
            **kwargs,
        )

    if venue_norm == "hyperliquid":
        missing = []
        if credentials is None or not credentials.wallet_address:
            missing.append("wallet_address")
        if credentials is None or not credentials.private_key:
            missing.append("private_key")
        if missing:
            raise ValueError("Hyperliquid adapter requires credentials with: " + ", ".join(missing))
        assert credentials is not None  # for type checkers
        assert credentials.wallet_address is not None
        assert credentials.private_key is not None
        return HyperliquidAdapter(
            wallet_address=credentials.wallet_address,
            api_wallet_private_key=credentials.private_key,
            testnet=testnet,
            **kwargs,
        )

    raise ValueError(f"Unknown venue {venue!r}; supported venues are paper, asterdex, hyperliquid")


__all__ = [
    "DexAdapter",
    "PaperAdapter",
    "HyperliquidAdapter",
    "AsterDexAdapter",
    "build_adapter",
]
