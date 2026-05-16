# server/

Go HTTP + WebSocket services for Crypto Arena Survivors. This is a standalone
Go module (its own `go.mod`), not an npm workspace. It exposes the public API
under `cmd/api/` and houses the internal packages: `internal/auth/` for guest
and wallet-signature authentication, `internal/matchmaking/` for queue and
skill bracketing, `internal/gameserver/` for the authoritative match loop,
and `internal/rewards/` for the prize pool ledger and payout pipeline. Real
implementation lands in FEAT-003.
