"""YAML + environment configuration loader."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict


class LLMConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: Literal["fake", "openai", "anthropic"] = "fake"
    model: str = "fake-model"
    temperature: float = 0.2
    base_url: str | None = None


class VenueConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Literal["hyperliquid", "asterdex", "paper"] = "paper"
    testnet: bool = True
    account_address: str | None = None


class CredentialsConfig(BaseModel):
    """Top-level credential gating flags (does NOT contain actual secrets)."""

    model_config = ConfigDict(extra="forbid")

    live: bool = False


class RiskConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_notional_usd: float = 1000.0
    max_leverage: float = 3.0
    symbol_allowlist: list[str] = Field(default_factory=list)
    daily_loss_cap_usd: float = 200.0
    min_confidence: float = 0.55


class RunConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    poll_interval_s: int = 60
    symbols: list[str] = Field(default_factory=list)
    dry_run: bool = True
    live: bool = False


class AppConfig(BaseSettings):
    """Root application config. Composed of nested sub-configs."""

    model_config = SettingsConfigDict(
        env_prefix="DEX_AI_",
        env_nested_delimiter="__",
        extra="forbid",
    )

    llm: LLMConfig = Field(default_factory=LLMConfig)
    venue: VenueConfig = Field(default_factory=VenueConfig)
    risk: RiskConfig = Field(default_factory=RiskConfig)
    run: RunConfig = Field(default_factory=RunConfig)
    credentials: CredentialsConfig = Field(default_factory=CredentialsConfig)

    @model_validator(mode="after")
    def _check_live_invariant(self) -> AppConfig:
        if self.run.live:
            if self.run.dry_run:
                raise ValueError("run.live=true requires run.dry_run=false")
            if not self.credentials.live:
                raise ValueError(
                    "run.live=true requires credentials.live=true to confirm live trading"
                )
        return self

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        # Env vars must override values loaded from YAML (which arrive via init).
        return (env_settings, dotenv_settings, init_settings, file_secret_settings)


def load_config(path: Path) -> AppConfig:
    """Load YAML at ``path`` and overlay env vars with prefix ``DEX_AI_``.

    Env vars use the nested delimiter ``__`` (e.g. ``DEX_AI_RISK__MAX_LEVERAGE=5``).
    """
    raw: dict[str, Any] = {}
    if path.exists():
        with path.open("r", encoding="utf-8") as fh:
            loaded = yaml.safe_load(fh) or {}
        if not isinstance(loaded, dict):
            raise ValueError(f"Config file {path} must contain a YAML mapping at the top level")
        raw = loaded

    # BaseSettings layers env vars on top of the values we pass in.
    return AppConfig(**raw)


__all__ = [
    "LLMConfig",
    "VenueConfig",
    "CredentialsConfig",
    "RiskConfig",
    "RunConfig",
    "AppConfig",
    "load_config",
]
