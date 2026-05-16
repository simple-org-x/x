"""Typer-based CLI for dex-ai-trader."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console

from . import __version__
from .credentials import CredentialRecord, CredentialStore

app = typer.Typer(
    name="dex-ai-trader",
    help="Multi-agent AI trading system for Hyperliquid and AsterDex.",
    no_args_is_help=True,
)
console = Console()

SUPPORTED_VENUES = ("hyperliquid", "asterdex", "paper")


@app.command()
def version() -> None:
    """Print the package version."""
    console.print(__version__)


@app.command()
def run() -> None:
    """Run the trading loop (stub - wired up in FEAT-004)."""
    console.print("not implemented yet")
    raise typer.Exit(code=0)


def _store_path_from_env(default: Path | None = None) -> Path | None:
    """Optional override path used by tests."""
    override = os.environ.get("DEX_AI_CREDENTIALS_PATH")
    if override:
        return Path(override)
    return default


def _read_input(prompt: str, env_var: str, *, no_input: bool, secret: bool = False) -> str:
    """Get a value either from an env var (no_input=True) or interactive prompt."""
    if no_input:
        value = os.environ.get(env_var)
        if value is None:
            raise typer.BadParameter(
                f"--no-input requires environment variable {env_var} to be set"
            )
        return value
    return str(typer.prompt(prompt, hide_input=secret))


def _read_bool(prompt: str, env_var: str, *, no_input: bool, default: bool = True) -> bool:
    if no_input:
        raw = os.environ.get(env_var)
        if raw is None:
            return default
        return raw.strip().lower() in {"1", "true", "yes", "y"}
    return typer.confirm(prompt, default=default)


def _build_record(venue: str, *, no_input: bool) -> CredentialRecord:
    if venue == "hyperliquid":
        account_address = _read_input(
            "Hyperliquid account address (0x...)",
            "DEX_AI_HL_ACCOUNT_ADDRESS",
            no_input=no_input,
        )
        private_key = _read_input(
            "Hyperliquid API wallet private key (0x...)",
            "DEX_AI_HL_PRIVATE_KEY",
            no_input=no_input,
            secret=True,
        )
        testnet = _read_bool(
            "Use Hyperliquid testnet?",
            "DEX_AI_HL_TESTNET",
            no_input=no_input,
            default=True,
        )
        return CredentialRecord(
            venue=venue,
            wallet_address=account_address,
            private_key=private_key,
            extra={"testnet": str(testnet).lower()},
        )
    if venue == "asterdex":
        api_key = _read_input(
            "AsterDex API key",
            "DEX_AI_ASTER_API_KEY",
            no_input=no_input,
        )
        api_secret = _read_input(
            "AsterDex API secret",
            "DEX_AI_ASTER_API_SECRET",
            no_input=no_input,
            secret=True,
        )
        testnet = _read_bool(
            "Use AsterDex testnet?",
            "DEX_AI_ASTER_TESTNET",
            no_input=no_input,
            default=True,
        )
        return CredentialRecord(
            venue=venue,
            api_key=api_key,
            api_secret=api_secret,
            extra={"testnet": str(testnet).lower()},
        )
    if venue == "paper":
        # The paper venue needs no real credentials; we still record it so
        # downstream code has a uniform `unlock` path.
        return CredentialRecord(venue=venue, extra={"testnet": "true"})

    raise typer.BadParameter(
        f"Unsupported venue: {venue}. Supported: {', '.join(SUPPORTED_VENUES)}"
    )


@app.command()
def connect(
    venue: Annotated[str, typer.Argument(help="Venue to connect: hyperliquid, asterdex, or paper")],
    no_input: Annotated[
        bool,
        typer.Option(
            "--no-input",
            help="Read credentials and passphrase from environment variables.",
        ),
    ] = False,
    store_path: Annotated[
        Path | None,
        typer.Option(
            "--store-path",
            help=(
                "Override path for the encrypted credential store "
                "(defaults to ~/.dex-ai-trader/credentials.enc)."
            ),
        ),
    ] = None,
) -> None:
    """One-time interactive wizard that saves encrypted credentials for a venue."""
    if venue not in SUPPORTED_VENUES:
        raise typer.BadParameter(
            f"Unsupported venue: {venue}. Supported: {', '.join(SUPPORTED_VENUES)}"
        )

    console.print(
        "[bold yellow]WARNING[/bold yellow]: credentials you enter will be encrypted at "
        "rest using a key derived from your passphrase. Anyone with both the passphrase "
        "and the encrypted file can recover them. Live trading puts REAL FUNDS at risk."
    )

    record = _build_record(venue, no_input=no_input)

    passphrase = _read_input(
        "Passphrase for credential store",
        "DEX_AI_PASSPHRASE",
        no_input=no_input,
        secret=True,
    )
    if not no_input:
        confirm = typer.prompt("Confirm passphrase", hide_input=True)
        if confirm != passphrase:
            console.print("[red]Passphrases do not match.[/red]")
            raise typer.Exit(code=1)

    resolved_path = store_path if store_path is not None else _store_path_from_env()
    store = CredentialStore(store_path=resolved_path)
    store.put(record, passphrase=passphrase)

    console.print(
        f"[green]\u2713[/green] Saved credentials for [bold]{venue}[/bold] to "
        f"{store.store_path}."
    )
    console.print("You only need to run connect once per venue.")


if __name__ == "__main__":  # pragma: no cover
    app()
