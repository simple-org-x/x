"""Tests for the `dex-ai-trader paper` and `run` CLI commands."""

from __future__ import annotations

import logging
from pathlib import Path

import pytest
from typer.testing import CliRunner

from dex_ai_trader.cli import app
from dex_ai_trader.logging_setup import RedactingFilter


def _root_has_redacting_filter() -> bool:
    root = logging.getLogger()
    return any(any(isinstance(f, RedactingFilter) for f in h.filters) for h in root.handlers)


def _strip_filters() -> None:
    """Remove any RedactingFilter instances from the root logger.

    Tests run in-process; once one CLI invocation installs the filter the
    others would no-op. To prove that a specific command installs it we
    strip filters first, then assert post-invocation.
    """
    root = logging.getLogger()
    for handler in root.handlers:
        for flt in list(handler.filters):
            if isinstance(flt, RedactingFilter):
                handler.removeFilter(flt)


def test_paper_runs_a_full_cycle() -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["paper"])
    assert result.exit_code == 0, result.output
    assert "PAPER FILL" in result.output


def test_paper_installs_redacting_filter() -> None:
    """The paper command must install the RedactingFilter on the root logger."""
    _strip_filters()
    assert _root_has_redacting_filter() is False

    runner = CliRunner()
    result = runner.invoke(app, ["paper"])
    assert result.exit_code == 0, result.output
    assert _root_has_redacting_filter() is True


def test_paper_with_explicit_scenario(tmp_path: Path) -> None:
    scenario = tmp_path / "scenario.yaml"
    scenario.write_text(
        """
symbol: ETH-USD
mark_price: 2000.0
initial_cash: 10000.0
responses:
  - action: trade
    venue: paper
    symbol: ETH-USD
    side: buy
    order_type: market
    size: 0.01
    rationale: small eth long
    confidence: 0.7
  - verdict: approve
    critique: looks fine
  - decision: approve
    justification: ok
""".strip(),
        encoding="utf-8",
    )
    runner = CliRunner()
    result = runner.invoke(app, ["paper", "--scenario", str(scenario)])
    assert result.exit_code == 0, result.output
    assert "PAPER FILL" in result.output
    assert "ETH-USD" in result.output


def test_run_live_flag_without_config_live_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
run:
  live: false
  dry_run: true
  symbols: [BTC-USD]
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.setenv("DEX_AI_PASSPHRASE", "hunter2")

    runner = CliRunner()
    result = runner.invoke(
        app,
        [
            "run",
            "--once",
            "--live",
            "--config",
            str(config_path),
            "--store-path",
            str(tmp_path / "creds.enc"),
            "--no-input",
        ],
    )
    assert result.exit_code != 0
    assert "live" in result.output.lower()


def test_run_dry_run_paper_cycle_succeeds(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
llm:
  provider: fake
  model: fake-model
venue:
  name: paper
  testnet: true
risk:
  max_notional_usd: 1000000.0
  max_leverage: 10.0
  symbol_allowlist: [BTC-USD]
  daily_loss_cap_usd: 1000000.0
  min_confidence: 0.0
run:
  poll_interval_s: 1
  symbols: [BTC-USD]
  dry_run: true
  live: false
credentials:
  live: false
""".strip(),
        encoding="utf-8",
    )
    monkeypatch.setenv("DEX_AI_PASSPHRASE", "hunter2")

    # Create the credential store first (load_or_generate_responsible_secret
    # refuses to auto-create on first run; the user is required to have run
    # `connect` at least once).
    store_path = tmp_path / "creds.enc"
    from dex_ai_trader.credentials import CredentialRecord, CredentialStore

    pre_store = CredentialStore(store_path=store_path)
    pre_store.put(CredentialRecord(venue="paper"), passphrase="hunter2")

    runner = CliRunner()
    result = runner.invoke(
        app,
        [
            "run",
            "--once",
            "--no-live",
            "--config",
            str(config_path),
            "--store-path",
            str(store_path),
            "--no-input",
        ],
    )
    # The default LLMConfig provider=fake returns {} which won't satisfy the
    # analyst schema; the cycle should still complete cleanly (the orchestrator
    # catches the AgentError and audits 'cycle_error' / 'cycle_complete').
    assert result.exit_code == 0, result.output
    # Either we placed a paper fill or we recorded "no order placed".
    assert "Cycle complete" in result.output or "PAPER" in result.output


def test_run_installs_redacting_filter(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The run command must install the RedactingFilter on the root logger."""
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
llm:
  provider: fake
  model: fake-model
venue:
  name: paper
  testnet: true
risk:
  max_notional_usd: 1000000.0
  max_leverage: 10.0
  symbol_allowlist: [BTC-USD]
  daily_loss_cap_usd: 1000000.0
  min_confidence: 0.0
run:
  poll_interval_s: 1
  symbols: [BTC-USD]
  dry_run: true
  live: false
credentials:
  live: false
""".strip(),
        encoding="utf-8",
    )
    monkeypatch.setenv("DEX_AI_PASSPHRASE", "hunter2")
    store_path = tmp_path / "creds.enc"
    from dex_ai_trader.credentials import CredentialRecord, CredentialStore

    pre_store = CredentialStore(store_path=store_path)
    pre_store.put(CredentialRecord(venue="paper"), passphrase="hunter2")

    _strip_filters()
    assert _root_has_redacting_filter() is False

    runner = CliRunner()
    result = runner.invoke(
        app,
        [
            "run",
            "--once",
            "--no-live",
            "--config",
            str(config_path),
            "--store-path",
            str(store_path),
            "--no-input",
        ],
    )
    assert result.exit_code == 0, result.output
    assert _root_has_redacting_filter() is True
