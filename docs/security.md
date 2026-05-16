# Security notes

This document is a short reference for the three security-relevant operational topics in `dex-ai-trader`: log redaction, HMAC secret rotation, and credential revocation. The full threat model lives in [architecture.md](architecture.md).

## Log redaction

`dex_ai_trader.logging_setup.configure_logging()` installs a `RedactingFilter` on every handler attached to the root logger. The filter rewrites both record arguments and free-form strings before they leave the process.

Sensitive field names (case-insensitive substring match):

* `secret_key`
* `private_key`
* `api_secret`
* `passphrase`
* `signer_private_key`
* `password`

Both shapes are covered:

* Keyword-style: `logger.info("...", extra={"private_key": "0xabc"})` becomes `***REDACTED***`.
* Inline: any string containing `private_key=0xabc`, `"api_secret": "..."`, or `passphrase: hunter2` is rewritten to `***REDACTED***`.

If you add a new credential field, extend `SENSITIVE_FIELDS` in `src/dex_ai_trader/logging_setup.py` and add a unit test under `tests/test_logging.py` that exercises both shapes.

## HMAC secret rotation

The `responsible_secret` is 32 random bytes, generated on first run and stored hex-encoded under `CredentialRecord.extra["hmac_secret"]` for venue `responsible`. To rotate it:

1. Unlock the credential store (any `run` invocation does this) so its in-memory state is consistent.
2. Stop the running loop.
3. Delete only the `responsible` entry from the encrypted blob, or delete the entire file (see below) if you also want to rotate venue credentials.
4. Run any `dex-ai-trader run` command with the same passphrase. The agent factory regenerates a fresh 32-byte secret via `os.urandom(32)` and persists it.

Any pre-existing `ApprovedOrder` signed with the old secret is now invalid; the Executor will refuse it with `UnauthorizedOrderError`. This is the correct behaviour; signatures must not survive rotation.

You should rotate the secret if:

* The credential file or passphrase has been exposed.
* You are migrating to a new machine (treat the old machine as untrusted).
* A long-running deployment has been running on the same secret for longer than your operational policy allows.

## Revoking credentials

There is no central server to call. To revoke:

1. Delete the encrypted file:

    ```bash
    rm ~/.dex-ai-trader/credentials.enc
    ```

2. On Hyperliquid, revoke the API wallet from [app.hyperliquid.xyz/API](https://app.hyperliquid.xyz/API) so the leaked private key (if any) cannot be used.
3. On AsterDex, delete the API key in the venue's dashboard.
4. Re-run `uv run dex-ai-trader connect <venue>` with fresh credentials and a fresh passphrase. The first `run` after this regenerates the `responsible_secret` automatically.

If you only forgot the passphrase, the same procedure applies: there is no recovery path because PBKDF2 + Fernet is one-way by design.
