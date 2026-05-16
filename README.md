# dex-ai-trader

Multi-agent AI trading system for Hyperliquid and AsterDex. Default mode is paper / dry-run; live trading is an explicit two-step opt-in.

> **WARNING: This software can place real trades on real DEXes with real money. Default mode is paper / dry-run. Enabling live mode requires both `--live` on the CLI and `live: true` in your config. You are solely responsible for losses.**

---

## Table of contents

1. [Architecture overview](#architecture-overview)
2. [Quickstart](#quickstart)
3. [One-time DEX connection wizard](#one-time-dex-connection-wizard)
4. [Configuring the LLM provider](#configuring-the-llm-provider)
5. [Risk controls](#risk-controls)
6. [Running: paper, dry-run, live](#running-paper-dry-run-live)
7. [Audit log](#audit-log)
8. [Development](#development)
9. [FAQ and troubleshooting](#faq-and-troubleshooting)
10. [License](#license)

(Sections are numbered to match the order the project's documentation plan calls out; the items "project name and one-line summary" and the warning appear above.)

---

## Architecture overview

A trading decision flows through four specialised agents. Each agent has a typed Pydantic input/output contract, so swapping any one of them out (for example, replacing the LLM-backed Reviewer with a rules-based one) is a local change. Only the Responsible agent can authorize an order, and the Executor cryptographically verifies that authorization before talking to a DEX.

```
                    +------------------------+
                    |  Credential vault      |
                    |  ~/.dex-ai-trader/     |
                    |  credentials.enc       |
                    |  (PBKDF2 -> Fernet)    |
                    +-----------+------------+
                                |
                  passphrase    |   hmac_secret (responsible/extra)
                                v
+---------+   ProposedTrade  +----------+  ReviewedTrade  +-------------+
| Analyst | ---------------> | Reviewer | --------------> | Responsible |
+---------+                  +----------+                 +------+------+
     ^                                                           |
     | AgentContext                                              | ApprovedOrder
     | (markets, ticker,                                         | (HMAC-SHA256 signed)
     |  positions, balances)                                     v
     |                                              +------------+------+
     |                                              | Executor          |
     |                                              | (verifies HMAC,   |
     |                                              |  refuses tampered |
     |                                              |  orders)          |
     |                                              +---+---------------+
     |                                                  |
     |                                                  | place_order
     |                                                  v
     |                                       +----------+-----------+
     +---------------------------------------+  DEX adapter         |
                                             |  (Paper / Hyperliquid|
                                             |   / AsterDex)        |
                                             +----------------------+
```

* **AnalystAgent** looks at recent market data and produces a `ProposedTrade` (or a hold).
* **ReviewerAgent** critiques the proposal and emits a `ReviewedTrade` with verdict `approve`, `amend`, or `reject`.
* **ResponsibleAgent** runs deterministic risk checks, asks the LLM for a final go/no-go, and on approval mints an `ApprovedOrder` whose `signature` field is `HMAC-SHA256(responsible_secret, canonical_json(decision_id, trade, approved_at))`. **It is the sole constructor of `ApprovedOrder`.**
* **ExecutorAgent** recomputes the HMAC with `hmac.compare_digest`. If it does not match, it raises `UnauthorizedOrderError` and the order is dropped. Otherwise it routes the order to the configured `DexAdapter`.

The `responsible_secret` is 32 random bytes generated on first run, hex-encoded, and stored in the credential vault under venue `responsible` / `extra.hmac_secret`. See [docs/architecture.md](docs/architecture.md) for the worked example.

---

## Quickstart

The quickstart needs only Python 3.11 and `uv`. No API keys, no network calls beyond package installs.

```bash
# 1. install uv (if you do not already have it)
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2. install project dependencies into a managed venv
uv sync --all-extras

# 3. run the zero-config paper demo
uv run dex-ai-trader paper
```

Expected output (the `decision_id` is a fresh UUID each run):

```
PAPER FILL: symbol=BTC-USD side=buy size=0.001 avg_price=30000.0 status=paper decision_id=<uuid>
```

The `paper` subcommand reads `examples/paper_scenario.yaml`, drives a deterministic `FakeLLMClient` through one full Analyst, Reviewer, Responsible, Executor cycle, and fills against the in-memory `PaperAdapter`. No credential store, no API keys, no network.

To see all subcommands:

```bash
uv run dex-ai-trader --help
```

---

## One-time DEX connection wizard

You only run `connect` once per venue. It prompts for credentials, derives a Fernet key from your passphrase using PBKDF2-HMAC-SHA256 (200,000 iterations), and writes the encrypted blob to `~/.dex-ai-trader/credentials.enc` with mode `0600`.

### Hyperliquid

```bash
uv run dex-ai-trader connect hyperliquid
```

Prompts (in order):

1. `Hyperliquid account address (0x...)`. This is your **main wallet address** (the account that holds funds), not the API wallet. Both addresses are visible in [app.hyperliquid.xyz/API](https://app.hyperliquid.xyz/API).
2. `Hyperliquid API wallet private key (0x...)`. Generate this on the same page; it is the **API wallet** key, never your main wallet key. Hidden input.
3. `Use Hyperliquid testnet?` (y/n, default y).
4. `Passphrase for credential store` (hidden) and a confirmation prompt.

### AsterDex

```bash
uv run dex-ai-trader connect asterdex
```

Prompts (in order):

1. `AsterDex API key`.
2. `AsterDex API secret` (hidden).
3. `Use AsterDex testnet?` (y/n, default y).
4. `Passphrase for credential store` (hidden) and a confirmation prompt.

### Notes

* The encrypted file has mode `0600` (owner read/write only). The directory is created automatically.
* Credentials are encrypted with PBKDF2-HMAC-SHA256 (200,000 iterations) plus Fernet (AES-128-CBC + HMAC-SHA256). Anyone with both the passphrase and the file can recover your keys; treat the passphrase like the keys themselves.
* To reuse the same passphrase non-interactively (for CI or automation), run with `--no-input` and set `DEX_AI_PASSPHRASE` plus the venue-specific env vars (see `uv run dex-ai-trader connect --help`).
* To revoke credentials, delete `~/.dex-ai-trader/credentials.enc` and run `connect` again. See [docs/security.md](docs/security.md).

---

## Configuring the LLM provider

The default provider is `fake` (a deterministic stub used in tests and the paper demo). For real-model runs install the matching extra and configure the provider in YAML.

```bash
# OpenAI
uv sync --extra openai

# Anthropic
uv sync --extra anthropic

# Both
uv sync --extra openai --extra anthropic
```

Set the API key either as an environment variable or as a credential entry under the provider name:

```bash
export OPENAI_API_KEY=sk-...        # or
export ANTHROPIC_API_KEY=sk-ant-...
```

Example YAML snippets (see `examples/config.example.yaml`):

```yaml
llm:
  provider: fake          # one of: fake, openai, anthropic
  model: fake-model
  temperature: 0.2
  base_url: null
```

```yaml
llm:
  provider: openai
  model: gpt-4o-mini
  temperature: 0.2
```

```yaml
llm:
  provider: anthropic
  model: claude-3-5-sonnet-latest
  temperature: 0.2
```

If you select `openai` or `anthropic` without installing the matching extra, the CLI exits with a helpful error telling you the exact `uv sync --extra <name>` command to run.

---

## Risk controls

Risk limits live under `risk:` in your config. They are enforced by `ResponsibleAgent` **before** the LLM is asked for a final go/no-go, so an LLM that ignores its instructions cannot bypass them.

```yaml
risk:
  max_notional_usd: 1000.0   # |size| * reference_price must be <= this
  max_leverage: 3.0          # current position leverage cap
  symbol_allowlist:          # if non-empty, only these symbols are tradable
    - BTC-USD
    - ETH-USD
  daily_loss_cap_usd: 200.0  # PLACEHOLDER, see note below
  min_confidence: 0.55       # analyst confidence threshold
```

> **Note on `daily_loss_cap_usd`:** this limit is wired through `ResponsibleAgent` and is enforced when `AgentContext.history` contains the right execution reports, but the orchestrator does not yet persist `ExecutionReport`s across cycles (`history` is reset to `[]` at the start of every cycle), and the realized-PnL proxy in `risk._daily_realized_pnl` sums positive notional rather than signed PnL. As a result `daily_loss_cap_usd` does **not** fire in normal operation. Treat it as a placeholder until persistence and side-aware PnL accounting land. (TODO.)

Tuning tips:

* Start with a tight `max_notional_usd` (the default `1000.0` USD is already small) and raise it only after you have observed several paper cycles.
* Keep `symbol_allowlist` minimal; it is a defence against the LLM proposing exotic symbols.
* `min_confidence` of `0.55` rejects low-conviction proposals. Raise it if you want a more conservative agent.
* Every limit can also be set via env var with `DEX_AI_` prefix and `__` as the nested delimiter, for example `DEX_AI_RISK__MAX_LEVERAGE=5`.

---

## Running: paper, dry-run, live

There are three modes. Live trading is the only one that can lose money, and it requires **two** independent opt-ins.

### 1. Paper (no config, no credentials)

```bash
uv run dex-ai-trader paper
```

Reads `examples/paper_scenario.yaml`, scripts a `FakeLLMClient`, fills against `PaperAdapter`. Useful to confirm the install works.

### 2. Dry-run (real config, real LLM, paper executor)

```bash
uv run dex-ai-trader run --config examples/config.example.yaml --once
```

This is the default for the `run` subcommand. It loads your config, gathers context from the configured venue's read-only API (or `paper` if you keep `venue.name: paper`), runs the full agent pipeline, and routes any approved order to the `PaperAdapter`. No funds move. The `--once` flag (default) runs a single cycle; pass `--continuous` to poll on `run.poll_interval_s`.

### 3. Live (real money)

You must satisfy **all three** of the following before a live order can be placed:

1. In your config:

    ```yaml
    run:
      dry_run: false
      live: true
    credentials:
      live: true
    ```

   The config validator rejects `run.live=true` unless `run.dry_run=false` **and** `credentials.live=true`.

2. The CLI flag:

    ```bash
    uv run dex-ai-trader run --config /path/to/your-config.yaml --live --once
    ```

   If you pass `--live` without `run.live=true` in the config, the CLI exits with an error. If `run.live=true` is set in the config but `--live` is not passed, the CLI also exits with an error. Both must agree.

3. A working credential entry for the venue, created via `connect`.

When live mode is active, the CLI prints a red `LIVE TRADING IS ENABLED` banner before doing anything else.

---

## Audit log

Every cycle appends JSON Lines to `~/.dex-ai-trader/audit.jsonl` (mode `0600`).

Each record has the shape:

```json
{"ts": "2025-01-01T00:00:00+00:00", "event": "responsible_approve", "payload": {"decision_id": "...", "trade": {"...": "..."}, "justification": "..."}}
```

Events emitted in a single cycle (in order):

* `cycle_start` (with `symbol`, `live`)
* `analyst` (with the proposed trade)
* `reviewer` (with verdict, critique, optional amended trade)
* one of `responsible_approve`, `responsible_veto`, `risk_block`, or `no_trade`
* on approval: `executor_paper_fill` (dry-run) or `executor_live_result` (live)
* `cycle_complete` (with `outcome` and, when an order was placed, `decision_id`)

The `decision_id` UUID is the correlation key: it appears on every event from `responsible_approve` onward, so you can `grep` one cycle out of the log:

```bash
grep <decision-id> ~/.dex-ai-trader/audit.jsonl
```

The audit log is strictly append-only. Sensitive fields are redacted before they ever reach the logger (see [docs/security.md](docs/security.md)).

---

## Development

The project uses `uv` plus `ruff` (lint), `black` (format), `mypy` (types), and `pytest` (tests). All four must be green to merge.

```bash
uv sync --all-extras
uv run ruff check src tests
uv run black --check src tests
uv run mypy src
uv run pytest -q
```

Conventions:

* `src/` layout. Source under `src/dex_ai_trader/`, tests under `tests/`.
* Type hints are required. `mypy --strict` runs on `src/`.
* Public API lives under the `dex_ai_trader.*` namespace.
* No real network calls in the default test run. The AsterDex tests use `respx` to mock HTTP; the Hyperliquid tests use `pytest.importorskip("hyperliquid")` and monkeypatched SDK objects, so they are skipped if the optional extra is not installed.
* No real LLM calls in tests; use `FakeLLMClient`.
* See `examples/config.example.yaml` for a fully commented config template.

---

## FAQ and troubleshooting

**`uv run dex-ai-trader paper` printed an error about the scenario file.**
The default scenario lives at `examples/paper_scenario.yaml` relative to the repo root. Run from the repo root, or pass `--scenario /absolute/path/to/paper_scenario.yaml`.

**`connect` says "Passphrases do not match".**
The wizard asks you to type the passphrase twice. They have to match exactly. Re-run `connect`; nothing was written.

**`run` says "DEX_AI_PASSPHRASE must be set when --no-input is used".**
Pass `--no-input` only if you have already exported `DEX_AI_PASSPHRASE` in the same shell. Otherwise omit `--no-input` and the CLI will prompt.

**`run --live` exits with an error about `config.run.live=false`.**
Both opt-ins are required. Set `run.dry_run: false`, `run.live: true`, and `credentials.live: true` in your config, then pass `--live` on the CLI. See [Running: paper, dry-run, live](#running-paper-dry-run-live).

**The Analyst raises a schema validation error.**
This usually means the LLM returned malformed JSON. The agent retries once with the schema appended, then gives up and the orchestrator audit-logs `cycle_error`. Lower `temperature` in your `llm:` config or switch to a model that supports structured output.

**I forgot my passphrase.**
There is no recovery path; PBKDF2 + Fernet is one-way. Delete `~/.dex-ai-trader/credentials.enc` and run `connect` again with new credentials. See [docs/security.md](docs/security.md).

**How do I rotate the responsible HMAC secret?**
Delete the `responsible` entry from the credential file and rerun any `run` command; a fresh secret is generated and persisted. Pre-existing `ApprovedOrder` objects signed with the old secret will be rejected by the Executor (which is intentional).

---

## License

MIT (placeholder). Add a `LICENSE` file at the repo root before publishing.
