"""Typer-based CLI for dex-ai-trader."""

from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

import typer
import yaml
from rich.console import Console

from . import __version__
from .agents import (
    AnalystAgent,
    ExecutorAgent,
    ResponsibleAgent,
    ReviewerAgent,
    load_or_generate_responsible_secret,
)
from .audit import AuditLog
from .config import AppConfig, load_config
from .credentials import CredentialRecord, CredentialStore
from .dex import build_adapter
from .dex.paper import PaperAdapter
from .llm import FakeLLMClient, build_llm_client
from .llm.base import LLMClient
from .models import AgentContext, Market, Ticker
from .orchestrator import TradingLoop
from .risk import RiskLimits

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


# -- run --------------------------------------------------------------------


LIVE_BANNER = (
    "[bold red]==============================[/bold red]\n"
    "[bold red] LIVE TRADING IS ENABLED [/bold red]\n"
    "[bold red]==============================[/bold red]"
)


def _resolve_config(config_path: Path | None) -> AppConfig:
    if config_path is None:
        return AppConfig()
    return load_config(config_path)


def _read_passphrase(no_input: bool) -> str:
    env_value = os.environ.get("DEX_AI_PASSPHRASE")
    if env_value is not None:
        return env_value
    if no_input:
        raise typer.BadParameter("DEX_AI_PASSPHRASE must be set when --no-input is used")
    return str(typer.prompt("Passphrase", hide_input=True))


@app.command()
def run(
    config_path: Annotated[
        Path | None,
        typer.Option("--config", help="Path to YAML config file."),
    ] = None,
    once: Annotated[
        bool,
        typer.Option("--once/--continuous", help="Run a single cycle then exit."),
    ] = True,
    live: Annotated[
        bool,
        typer.Option(
            "--live/--no-live",
            help="Required (with config.run.live=true) for real trades.",
        ),
    ] = False,
    venue_override: Annotated[
        str | None,
        typer.Option("--venue", help="Override config.venue.name."),
    ] = None,
    symbol_override: Annotated[
        str | None,
        typer.Option("--symbol", help="Override config.run.symbols (single symbol)."),
    ] = None,
    no_input: Annotated[
        bool,
        typer.Option("--no-input", help="Read passphrase from DEX_AI_PASSPHRASE only."),
    ] = False,
    store_path: Annotated[
        Path | None,
        typer.Option("--store-path", help="Override credential store path."),
    ] = None,
) -> None:
    """Run one (``--once``) or many (``--continuous``) decision cycles."""
    try:
        cfg = _resolve_config(config_path)
    except Exception as exc:  # noqa: BLE001
        console.print(f"[red]Failed to load config:[/red] {exc}")
        raise typer.Exit(code=2) from exc

    if venue_override is not None:
        cfg = cfg.model_copy(
            update={"venue": cfg.venue.model_copy(update={"name": venue_override})}
        )
    if symbol_override is not None:
        cfg = cfg.model_copy(
            update={"run": cfg.run.model_copy(update={"symbols": [symbol_override]})}
        )

    # Live trading is gated by BOTH the CLI flag AND the config switch.
    if live and not cfg.run.live:
        console.print(
            "[red]--live was passed but config.run.live=false; "
            "set run.live=true (and run.dry_run=false, credentials.live=true) "
            "in your config to confirm live trading.[/red]"
        )
        raise typer.Exit(code=2)
    if cfg.run.live and not live:
        console.print(
            "[red]config.run.live=true but --live was not passed on the CLI; "
            "pass --live to confirm.[/red]"
        )
        raise typer.Exit(code=2)

    if cfg.run.live:
        console.print(LIVE_BANNER)

    passphrase = _read_passphrase(no_input=no_input)

    resolved_store_path = store_path if store_path is not None else _store_path_from_env()
    store = CredentialStore(store_path=resolved_store_path)
    store.unlock(passphrase)

    responsible_secret = load_or_generate_responsible_secret(store, passphrase)

    # Build LLM and adapters.
    try:
        llm = build_llm_client(cfg.llm, store)
    except Exception as exc:  # noqa: BLE001
        console.print(f"[red]Failed to build LLM client:[/red] {exc}")
        raise typer.Exit(code=2) from exc

    venue_name = cfg.venue.name
    venue_credentials = store.get(venue_name) if venue_name != "paper" else None

    paper_adapter = PaperAdapter()
    if cfg.run.live:
        try:
            live_adapter = build_adapter(venue_name, cfg.venue, venue_credentials)
        except Exception as exc:  # noqa: BLE001
            console.print(f"[red]Failed to build live adapter:[/red] {exc}")
            raise typer.Exit(code=2) from exc
    else:
        # In dry-run mode the live adapter is never called; reuse paper.
        live_adapter = paper_adapter

    audit = AuditLog()

    loop_obj = TradingLoop(
        config=cfg,
        dex_live=live_adapter,
        dex_paper=paper_adapter,
        llm=llm,
        audit=audit,
        responsible_secret=responsible_secret,
    )

    symbols = list(cfg.run.symbols) or ([symbol_override] if symbol_override else [])
    if not symbols:
        console.print(
            "[red]No symbols configured. Set run.symbols in config or pass --symbol.[/red]"
        )
        raise typer.Exit(code=2)

    if once:
        report = asyncio.run(loop_obj.run_cycle(symbols[0]))
        if report is None:
            console.print("[yellow]Cycle complete: no order placed.[/yellow]")
        else:
            console.print(
                f"[green]Cycle complete:[/green] status={report.status} "
                f"size={report.filled_size} avg_price={report.avg_price}"
            )
    else:
        asyncio.run(loop_obj.run_forever())


# -- paper shorthand --------------------------------------------------------


@app.command()
def paper(
    scenario: Annotated[
        Path | None,
        typer.Option(
            "--scenario",
            help="Path to a paper scenario YAML (default: examples/paper_scenario.yaml).",
        ),
    ] = None,
) -> None:
    """Run one deterministic Analyst -> Reviewer -> Responsible -> Executor cycle.

    Uses :class:`FakeLLMClient` scripted from the YAML scenario plus the
    in-memory :class:`PaperAdapter`. No API keys, no network, no credential
    store required.
    """
    scenario_path = scenario if scenario is not None else _default_scenario_path()
    if not scenario_path.exists():
        console.print(f"[red]Scenario file not found:[/red] {scenario_path}")
        raise typer.Exit(code=2)

    with scenario_path.open("r", encoding="utf-8") as fh:
        scenario_data = yaml.safe_load(fh) or {}
    if not isinstance(scenario_data, dict):
        console.print("[red]Invalid scenario file:[/red] expected a mapping at top level")
        raise typer.Exit(code=2)

    symbol = str(scenario_data.get("symbol", "BTC-USD"))
    mark_price = float(scenario_data.get("mark_price", 30_000.0))
    initial_cash = float(scenario_data.get("initial_cash", 100_000.0))
    responses = list(scenario_data.get("responses", []))
    if len(responses) < 3:
        console.print(
            "[red]Scenario must include at least 3 responses "
            "(analyst, reviewer, responsible).[/red]"
        )
        raise typer.Exit(code=2)

    llm: LLMClient = FakeLLMClient.from_sequence(responses)

    paper_adapter = PaperAdapter(
        initial_cash=initial_cash,
        mark_price=lambda _s: mark_price,
        markets=[
            Market(
                symbol=symbol,
                base=symbol.split("-")[0],
                quote=symbol.split("-")[-1],
                venue="paper",
                min_size=0.0001,
                price_precision=2,
            )
        ],
    )

    risk_limits = RiskLimits(
        max_notional_usd=1_000_000.0,
        max_leverage=10.0,
        symbol_allowlist=[symbol],
        daily_loss_cap_usd=1_000_000.0,
        min_confidence=0.0,
    )

    # Use an in-memory HMAC secret; the scenario does not touch the credential store.
    responsible_secret = os.urandom(32)

    audit = AuditLog()

    analyst = AnalystAgent(llm=llm, model="fake-paper")
    reviewer = ReviewerAgent(llm=llm, model="fake-paper")
    responsible = ResponsibleAgent(
        llm=llm,
        risk_limits=risk_limits,
        responsible_secret=responsible_secret,
        audit=audit,
        model="fake-paper",
    )
    executor = ExecutorAgent(
        dex=paper_adapter,
        responsible_secret=responsible_secret,
        is_live=False,
        audit=audit,
    )

    async def _run() -> None:
        ticker = Ticker(
            symbol=symbol,
            mid=mark_price,
            bid=mark_price,
            ask=mark_price,
            ts=datetime.now(tz=UTC),
        )
        ctx = AgentContext(
            markets=await paper_adapter.get_markets(),
            tickers={symbol: ticker},
            positions=await paper_adapter.get_positions(),
            balances=await paper_adapter.get_balances(),
            history=[],
            notes="paper scenario",
        )
        audit.append("cycle_start", {"symbol": symbol, "live": False})

        proposed = await analyst.run(ctx, default_symbol=symbol)
        audit.append("analyst", {"trade": proposed.model_dump(mode="json")})
        if proposed.size == 0:
            audit.append("no_trade", {"reason": "analyst_hold"})
            audit.append("cycle_complete", {"symbol": symbol, "outcome": "hold"})
            console.print("[yellow]Analyst held; no order placed.[/yellow]")
            return

        reviewed = await reviewer.run(proposed, ctx)
        audit.append(
            "reviewer",
            {"verdict": reviewed.verdict, "critique": reviewed.critique},
        )

        approved = await responsible.run(reviewed, ctx)
        if approved is None:
            audit.append("cycle_complete", {"symbol": symbol, "outcome": "no_order"})
            console.print("[yellow]Responsible vetoed; no order placed.[/yellow]")
            return

        report = await executor.run(approved, ctx)
        audit.append(
            "cycle_complete",
            {"symbol": symbol, "outcome": "placed", "decision_id": str(approved.decision_id)},
        )

        console.print(
            f"[green]PAPER FILL:[/green] symbol={symbol} side={approved.trade.side} "
            f"size={report.filled_size} avg_price={report.avg_price} "
            f"status={report.status} decision_id={approved.decision_id}"
        )

    asyncio.run(_run())


def _default_scenario_path() -> Path:
    """Resolve the bundled examples/paper_scenario.yaml relative to the repo root."""
    here = Path(__file__).resolve()
    # src/dex_ai_trader/cli.py -> repo_root/examples/paper_scenario.yaml
    repo_root = here.parents[2]
    return repo_root / "examples" / "paper_scenario.yaml"


if __name__ == "__main__":  # pragma: no cover
    app()
