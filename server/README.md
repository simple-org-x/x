# server/

Go HTTP + WebSocket services for Crypto Arena Survivors. This is a
standalone Go module (its own `go.mod`); it is not an npm workspace.

## Layout

```
cmd/api/                  Production entry point (graceful shutdown)
internal/auth/            Guest sessions + EIP-191 wallet login + JWT
internal/config/          Env-driven typed Config
internal/gameserver/      Per-match goroutine, 30Hz tick, input clamping
internal/httpapi/         Router assembly used by main and tests
internal/matchmaking/     Queue + bucket-by-MMR matcher
internal/middleware/      Request ID, slog access log, recover, ratelimit, CORS
internal/realtime/        WebSocket Hub for /ws (uses github.com/coder/websocket)
internal/rewards/         Prize-pool ledger + distribution table
```

Every package lives under `internal/` so external modules cannot import
them. Phase-1 implementations are in-memory; each storage seam is an
interface (`auth.NonceStore`, `matchmaking.Queue`, `rewards.Ledger`) so
Redis or Postgres adapters drop in without touching call sites.

## Endpoints

| Method | Path                          | Auth | Notes                                              |
|--------|-------------------------------|------|----------------------------------------------------|
| GET    | `/healthz`                    | -    | Liveness probe                                     |
| GET    | `/readyz`                     | -    | Readiness probe                                    |
| POST   | `/api/auth/guest`             | -    | Issues a guest JWT                                 |
| POST   | `/api/auth/wallet/nonce`      | -    | Returns a per-address single-use nonce             |
| POST   | `/api/auth/wallet/verify`     | -    | Consumes nonce, verifies signature, issues JWT     |
| POST   | `/api/matchmaking/queue`      | JWT  | Enqueue (solo short-circuits to a synthetic match) |
| DELETE | `/api/matchmaking/queue`      | JWT  | Cancel queue entry                                 |
| GET    | `/api/matchmaking/status`     | JWT  | Current queue ticket                               |
| POST   | `/api/match/start`            | JWT  | Spawns a per-match goroutine                       |
| POST   | `/api/match/end`              | JWT  | Tears down the goroutine                           |
| GET    | `/api/match/{id}`             | JWT  | Lookup match by id                                 |
| GET    | `/api/rewards/me`             | JWT  | Distributions credited to caller                   |
| POST   | `/api/rewards/claim`          | JWT  | Stub: flips the Claimed flag                       |
| GET    | `/ws`                         | JWT  | WebSocket; JWT via `Authorization` or `?access_token=` |

## Wallet login canonical message

The exact string the client must wrap with `personal_sign` is

```
Crypto Arena Survivors login: <nonce>
```

returned verbatim in the `message` field of `/api/auth/wallet/nonce`'s
response. The server prepends the EIP-191 prefix
(`\x19Ethereum Signed Message:\n<len>`), keccak256-hashes it, and
recovers the signer via go-ethereum's `crypto.SigToPub` +
`crypto.PubkeyToAddress`. Recovery byte 27/28 is normalized to 0/1.

Nonces are keyed by lower-cased address, single-use, and TTL'd by
`AUTH_NONCE_TTL` (default 5 minutes). Re-issuing for the same address
overwrites the previous nonce.

## Configuration

| Env                     | Default                    | Notes                                  |
|-------------------------|----------------------------|----------------------------------------|
| `HTTP_ADDR` / `PORT`    | `:8080`                    | Listen address                         |
| `JWT_SECRET`            | (insecure dev fallback)    | HS256 signing key                      |
| `CORS_ALLOWED_ORIGINS`  | `http://localhost:5173`    | Comma-separated allowlist              |
| `RATE_LIMIT_RPS`        | `20`                       | Per-IP token-bucket refill rate        |
| `RATE_LIMIT_BURST`      | `40`                       | Per-IP bucket size                     |
| `AUTH_NONCE_TTL`        | `5m`                       | Wallet-nonce lifetime                  |
| `AUTH_JWT_TTL`          | `24h`                      | Issued-JWT lifetime                    |
| `LOG_LEVEL`             | `info`                     | `debug` / `info` / `warn` / `error`    |
| `REDIS_URL`             | (unused, reserved)         | Will back NonceStore / Queue           |
| `POSTGRES_URL`          | (unused, reserved)         | Will back Ledger                       |

## Build, test, run

```bash
go mod tidy
go build ./...
go test ./...
go run ./cmd/api      # listens on :8080 by default
```

A multi-stage `Dockerfile` (alpine builder -> alpine runtime) builds a
static binary and is the artifact promoted by Cloud Build.
