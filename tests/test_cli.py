"""Tests for the Typer CLI."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from typer.testing import CliRunner

from dex_ai_trader.cli import app
from dex_ai_trader.credentials import CredentialStore


def test_help_lists_commands() -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0, result.output
    for cmd in ("version", "connect", "run"):
        assert cmd in result.output


def test_version_prints_package_version() -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert "0.1.0" in result.output


def test_run_is_a_stub() -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["run"])
    assert result.exit_code == 0
    assert "not implemented yet" in result.output


def test_connect_paper_no_input(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    store_path = tmp_path / "creds.enc"
    monkeypatch.setenv("DEX_AI_PASSPHRASE", "hunter2")

    runner = CliRunner()
    result = runner.invoke(
        app,
        ["connect", "paper", "--no-input", "--store-path", str(store_path)],
    )
    assert result.exit_code == 0, result.output
    assert store_path.exists()
    assert os.stat(store_path).st_mode & 0o777 == 0o600

    # Round-trip the saved record.
    store = CredentialStore(store_path=store_path)
    store.unlock("hunter2")
    rec = store.get("paper")
    assert rec is not None
    assert rec.venue == "paper"


def test_connect_hyperliquid_no_input(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    store_path = tmp_path / "creds.enc"
    monkeypatch.setenv("DEX_AI_PASSPHRASE", "hunter2")
    monkeypatch.setenv("DEX_AI_HL_ACCOUNT_ADDRESS", "0xAAA0000000000000000000000000000000000000")
    monkeypatch.setenv(
        "DEX_AI_HL_PRIVATE_KEY",
        "0xBEEF000000000000000000000000000000000000000000000000000000000000",
    )
    monkeypatch.setenv("DEX_AI_HL_TESTNET", "true")

    runner = CliRunner()
    result = runner.invoke(
        app,
        ["connect", "hyperliquid", "--no-input", "--store-path", str(store_path)],
    )
    assert result.exit_code == 0, result.output

    store = CredentialStore(store_path=store_path)
    store.unlock("hunter2")
    rec = store.get("hyperliquid")
    assert rec is not None
    assert rec.wallet_address == "0xAAA0000000000000000000000000000000000000"
    assert rec.private_key is not None
    assert rec.extra["testnet"] == "true"


def test_connect_unsupported_venue() -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["connect", "kraken", "--no-input"])
    assert result.exit_code != 0


def test_connect_no_input_requires_passphrase_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("DEX_AI_PASSPHRASE", raising=False)
    runner = CliRunner()
    result = runner.invoke(
        app,
        ["connect", "paper", "--no-input", "--store-path", str(tmp_path / "c.enc")],
    )
    assert result.exit_code != 0
