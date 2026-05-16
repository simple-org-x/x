# Architecture

This document explains how `dex-ai-trader` is put together: why the system is split into multiple agents, the typed contracts between them, the cryptographic gating between Responsible and Executor, the adapter abstractions for DEXes and LLM providers, the credential lifecycle, and the threat model.

The diagram is the same one shown in [README.md](../README.md):

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

## (a) Why multiple agents instead of one prompt

A single prompt that "look at the market, then place a trade" is hard to constrain. Splitting the work has two benefits:

* **Separation of concerns.** The Analyst focuses on whether *any* trade is justified by the market context. The Reviewer focuses on critiquing that proposal independently. The Responsible agent focuses on whether to authorize. The Executor focuses on placing the order safely. Each prompt can be small, single-purpose, and easy to review.
* **Adversarial review.** The Reviewer sees the Analyst's proposal as a hypothesis to attack rather than as its own output. This catches obvious failures (size too large, wrong side, low confidence) without relying on the Analyst to self-correct.

Crucially, neither the Analyst nor the Reviewer can place an order. They produce typed *suggestions*. The Responsible agent is the only one that can mint an `ApprovedOrder`, and it does so only after running the deterministic risk checks in `risk.check_order` and getting a final go from the LLM.

## (b) The agent contract

Every agent inherits from `dex_ai_trader.agents.base.Agent` and implements an `async run(...)` method whose inputs and outputs are Pydantic v2 models with `extra="forbid"`. The relevant types live in `dex_ai_trader.models`:

| Stage        | Input                                | Output                                         |
| ------------ | ------------------------------------ | ---------------------------------------------- |
| Analyst      | `AgentContext`                       | `ProposedTrade` (size 0 means hold)            |
| Reviewer     | `ProposedTrade`, `AgentContext`      | `ReviewedTrade` (verdict approve/amend/reject) |
| Responsible  | `ReviewedTrade`, `AgentContext`      | `ApprovedOrder` or `None`                      |
| Executor     | `ApprovedOrder`, `AgentContext?`     | `ExecutionReport` (or raises)                  |

Strict typing means a regression that drops a required field is caught at parse time, not in production. The `AgentContext` carries markets, the latest ticker, positions, balances, and recent execution history, so each agent sees the same world.

## (c) HMAC signing scheme

The `ResponsibleAgent` is the only place an `ApprovedOrder` is constructed. It signs the canonical JSON of `(decision_id, trade, approved_at, responsible_id)` with a 32-byte secret using HMAC-SHA256:

```python
def canonical_payload(decision_id, trade, approved_at, responsible_id):
    payload = {
        "decision_id": str(decision_id),
        "trade": trade.model_dump(mode="json"),
        "approved_at": approved_at.isoformat(),
        "responsible_id": responsible_id,
    }
    return json.dumps(
        payload, sort_keys=True, separators=(",", ":"), default=str
    ).encode("utf-8")

def sign_trade(secret, decision_id, trade, approved_at, responsible_id):
    payload = canonical_payload(decision_id, trade, approved_at, responsible_id)
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()
```

The Executor recomputes the signature with `hmac.compare_digest` and rejects mismatches:

```python
def verify_signature(self, approved):
    expected = sign_trade(
        self._secret,
        approved.decision_id,
        approved.trade,
        approved.approved_at,
        approved.responsible_id,
    )
    return hmac.compare_digest(expected, approved.signature)
```

### Worked example

Given:

* `decision_id = 11111111-1111-4111-8111-111111111111`
* `approved_at = 2025-01-01T00:00:00+00:00`
* `responsible_id = "responsible:gpt-4o-mini"`
* `trade.symbol = "BTC-USD"`, `side = "buy"`, `size = 0.001`, ...

The canonical payload is the bytes:

```
{"approved_at":"2025-01-01T00:00:00+00:00","decision_id":"11111111-1111-4111-8111-111111111111","responsible_id":"responsible:gpt-4o-mini","trade":{"analyst_id":"...","confidence":0.8,"limit_price":null,"order_type":"market","rationale":"...","side":"buy","size":0.001,"symbol":"BTC-USD","venue":"paper"}}
```

The signature is `HMAC-SHA256(secret, that-byte-string).hex()`. If anything in the trade changes (size, side, symbol, venue) or the `responsible_id` is swapped, the recomputed signature differs and the Executor refuses the order.

### Replay protection

The Executor closes the replay window with two checks layered on top of signature verification:

* `approved_at` must be no older than a configurable freshness window (default 60 seconds). Stale approvals are refused with `executor_unauthorized` / `reason=stale_approval`.
* Each `decision_id` is recorded in an in-process LRU set; subsequent submissions of the same `decision_id` are refused with `executor_unauthorized` / `reason=replayed_decision_id`. The set survives only the lifetime of the executor, which matches the threat model: the durable system of record for replay defence is the audit log.

The `responsible_secret` is 32 random bytes (`os.urandom(32)`), generated on first run and stored hex-encoded under `CredentialRecord.extra["hmac_secret"]` for venue `responsible`. This reuses the same encrypted credential file the user already protects with their passphrase; no new key material is added to disk in plaintext.

## (d) The `DexAdapter` abstraction and adding a new venue

Every DEX is hidden behind `dex_ai_trader.dex.base.DexAdapter`, an `abc.ABC` with these async methods:

```python
class DexAdapter(ABC):
    name: str

    async def get_markets(self) -> list[Market]: ...
    async def get_ticker(self, symbol: str) -> Ticker: ...
    async def get_balances(self) -> list[Balance]: ...
    async def get_positions(self) -> list[Position]: ...
    async def get_open_orders(self, symbol: str | None = None) -> list[dict]: ...
    async def place_order(self, approved: ApprovedOrder) -> ExecutionReport: ...
    async def cancel_order(self, symbol: str, exchange_order_id: str) -> bool: ...
    async def close(self) -> None: ...
```

The orchestrator picks an adapter via `dex_ai_trader.dex.build_adapter(venue_name, venue_config, credentials)`. To add a new venue:

1. Implement a subclass of `DexAdapter` under `src/dex_ai_trader/dex/<venue>_adapter.py`.
2. Wire it into `dex_ai_trader.dex.build_adapter` (and update the venue `Literal` in `models.py`).
3. Add unit tests under `tests/test_<venue>_adapter.py` using `httpx.MockTransport` (or the venue SDK's own fakes).
4. The Executor and Orchestrator need no changes; the adapter is selected at runtime.

## (e) The `LLMClient` protocol and adding a new provider

LLM access is a `typing.Protocol` (`dex_ai_trader.llm.base.LLMClient`):

```python
class LLMClient(Protocol):
    async def generate(
        self,
        messages: list[ChatMessage],
        response_schema: dict[str, Any],
        *,
        max_tokens: int = 1024,
    ) -> dict[str, Any]: ...
```

Implementations included:

* `FakeLLMClient`: deterministic, scripted responses. Used by tests and the `paper` subcommand.
* `OpenAIChatClient`: lazy import of `openai`. Selected by `provider: openai`.
* `AnthropicChatClient`: lazy import of `anthropic`. Selected by `provider: anthropic`.

To add a provider:

1. Implement a class with an `async generate(...)` matching the protocol under `src/dex_ai_trader/llm/<name>_client.py`.
2. Wire it into `dex_ai_trader.llm.build_llm_client` and add an extras group in `pyproject.toml` (so users install it with `uv sync --extra <name>`).
3. Raise `LLMConfigError` from your factory branch when the SDK is missing, with the exact `uv sync --extra <name>` command in the message.
4. Add a unit test that exercises the structured-output happy path and at least one failure mode.

The agent code never imports a concrete client; it depends only on the protocol.

## (f) Credential lifecycle

1. **Entered once.** The user runs `uv run dex-ai-trader connect <venue>` and types credentials plus a passphrase.
2. **Encrypted at rest.** The store derives a Fernet key with PBKDF2-HMAC-SHA256 (200,000 iterations) from the passphrase and a random 16-byte salt, then encrypts a JSON blob mapping venue name to `CredentialRecord`. The file is written with mode `0600` at `~/.dex-ai-trader/credentials.enc` (or wherever `--store-path` points).
3. **Decrypted into memory only while the loop runs.** `CredentialStore.unlock(passphrase)` populates an in-memory dict; `CredentialStore.lock()` clears it. `CredentialStore` instances are constructed by the CLI per-invocation, so credentials never outlive the process.
4. **Never logged.** A `RedactingFilter` masks `secret_key`, `private_key`, `api_secret`, `passphrase`, `signer_private_key`, and `password` (case-insensitive) in both keyword args and free-form messages. The CLI installs the filter via `logging_setup.configure_logging` at the start of every `run`, `paper`, and `connect` invocation. See [security.md](security.md).
5. **Revoked by deleting the file.** There is no central revocation server; deleting `~/.dex-ai-trader/credentials.enc` and re-running `connect` is the recovery path.

## (g) Threat model

We model an attacker who controls the LLM (because the user pointed at a malicious provider, because of a prompt-injection from market data, or because the model simply hallucinated a hostile response). What can the attacker do?

| Attack                                                              | Defence                                                                                                                                                                       |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Propose an oversized trade                                          | `ResponsibleAgent` calls `risk.check_order` **before** asking the LLM for go/no-go. `max_notional_usd`, `max_leverage`, `symbol_allowlist`, and `min_confidence` are enforced in pure Python. `daily_loss_cap_usd` is wired but does not yet fire in normal operation; see `risk.py` and the README. |
| Propose a low-confidence trade                                      | `min_confidence` (default `0.55`) is also enforced in `check_order`.                                                                                                          |
| Propose an exotic symbol                                            | `symbol_allowlist`, when set, is enforced in `check_order`.                                                                                                                   |
| Forge an `ApprovedOrder` directly to the Executor                   | The Executor calls `verify_signature` which recomputes the HMAC with `hmac.compare_digest`. Without the 32-byte `responsible_secret` an attacker cannot mint a valid signature. |
| Tamper with an in-flight `ApprovedOrder` (change size, side, venue, responsible_id) | The HMAC covers `decision_id`, the full `trade` payload, `approved_at`, and `responsible_id`. Any change invalidates the signature.                                          |
| Replay an old `ApprovedOrder`                                       | The Executor refuses `approved_at` older than a configurable freshness window (default 60s) and refuses any `decision_id` already seen in this process's lifetime via an in-process LRU. |
| Bypass the live-trading gate                                        | Live mode requires both `--live` on the CLI **and** `run.live: true` (with `run.dry_run: false` and `credentials.live: true`) in the config. The config validator rejects inconsistent settings (including `venue.name='paper'` with `run.live=true`); the CLI rejects mismatched flags. |
| Exfiltrate credentials through logs                                 | The CLI calls `configure_logging()` at the start of every `run` / `paper` / `connect` invocation, which attaches a `RedactingFilter` to the root handler. The filter masks sensitive keys and inline `name=value` pairs before the message is emitted. Test coverage in `tests/test_logging.py` and `tests/test_cli.py` exercises both shapes. |
| Read the credential file from disk                                  | The file has mode `0600` and is encrypted with a key derived from the user's passphrase. An attacker also needs the passphrase to recover plaintext. |
| Cause silent failures                                               | The orchestrator catches per-phase exceptions, audit-logs them as `cycle_error`, and continues. The Executor audit-logs `executor_unauthorized` whenever it refuses a signature, freshness check, or replay, which is the right signal for an alert. |

What an attacker controlling the LLM **cannot** do:

* They cannot bypass the deterministic risk checks; those run in code, not the model.
* They cannot mint a valid `ApprovedOrder` signature; the secret is not visible to the LLM.
* They cannot exfiltrate API keys via log messages because the redaction filter rewrites sensitive substrings.
* They cannot flip the system to live mode; that takes both human edits to the config file and a CLI flag.

Out of scope for this threat model: a local attacker with the user's filesystem access plus their passphrase (game over by definition), supply-chain attacks on the Python dependencies (covered by `uv.lock` pinning but not by the design itself), and exchange-side trust (you are still trusting Hyperliquid and AsterDex to honor your orders correctly).
