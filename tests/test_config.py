"""Tests for YAML + env config loading and live-mode invariant."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from dex_ai_trader.config import AppConfig, load_config


def _write_yaml(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def test_load_yaml(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # Ensure no DEX_AI_ env vars leak in from the host.
    for key in list(__import__("os").environ):
        if key.startswith("DEX_AI_"):
            monkeypatch.delenv(key, raising=False)

    cfg_path = tmp_path / "cfg.yaml"
    _write_yaml(
        cfg_path,
        """
risk:
  max_notional_usd: 500
  max_leverage: 2
  symbol_allowlist: [BTC-USD]
  daily_loss_cap_usd: 100
  min_confidence: 0.6
run:
  symbols: [BTC-USD]
  poll_interval_s: 30
  dry_run: true
  live: false
""".strip(),
    )

    cfg = load_config(cfg_path)
    assert cfg.risk.max_notional_usd == 500
    assert cfg.risk.symbol_allowlist == ["BTC-USD"]
    assert cfg.run.poll_interval_s == 30


def test_env_overlay(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    cfg_path = tmp_path / "cfg.yaml"
    _write_yaml(
        cfg_path,
        """
risk:
  max_notional_usd: 500
  max_leverage: 2
  symbol_allowlist: [BTC-USD]
  daily_loss_cap_usd: 100
""".strip(),
    )

    monkeypatch.setenv("DEX_AI_RISK__MAX_LEVERAGE", "9")
    cfg = load_config(cfg_path)
    assert cfg.risk.max_leverage == 9


def test_live_requires_no_dry_run(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in list(__import__("os").environ):
        if key.startswith("DEX_AI_"):
            monkeypatch.delenv(key, raising=False)

    with pytest.raises(ValidationError) as exc_info:
        AppConfig.model_validate(
            {
                "run": {"dry_run": True, "live": True, "symbols": ["BTC-USD"]},
                "credentials": {"live": True},
            }
        )
    assert "dry_run" in str(exc_info.value)


def test_live_requires_credentials_live(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in list(__import__("os").environ):
        if key.startswith("DEX_AI_"):
            monkeypatch.delenv(key, raising=False)

    with pytest.raises(ValidationError) as exc_info:
        AppConfig.model_validate(
            {
                "run": {"dry_run": False, "live": True, "symbols": ["BTC-USD"]},
                "credentials": {"live": False},
            }
        )
    assert "credentials.live" in str(exc_info.value)


def test_live_ok_when_both_flags_set(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in list(__import__("os").environ):
        if key.startswith("DEX_AI_"):
            monkeypatch.delenv(key, raising=False)

    cfg = AppConfig.model_validate(
        {
            "run": {"dry_run": False, "live": True, "symbols": ["BTC-USD"]},
            "credentials": {"live": True},
        }
    )
    assert cfg.run.live is True
    assert cfg.credentials.live is True


def test_load_config_missing_file_uses_defaults(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    for key in list(__import__("os").environ):
        if key.startswith("DEX_AI_"):
            monkeypatch.delenv(key, raising=False)

    missing = tmp_path / "no-such.yaml"
    cfg = load_config(missing)
    assert cfg.run.dry_run is True
