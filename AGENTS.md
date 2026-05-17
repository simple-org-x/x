# Crypto Arena Survivors — AGENTS.md

Monorepo: npm workspaces (`client/`, `contracts/`) + Go module (`server/`).

## Dev commands

```bash
make dev-client              # Vite :5173
make dev-server              # Go API :8080 (go run ./cmd/api)
make build                   # all workspaces
make test                    # all workspaces

# Client only
npm -w client run dev
npm -w client run build      # output: client/dist/
npm -w client run typecheck  # tsc --noEmit (required before PR)
npm -w client run test       # vitest run
npx vitest                   # watch mode

# Server only
cd server && go run ./cmd/api   # NOT main.go directly
cd server && go test ./...
cd server && go vet ./...

# Contracts
npm -w contracts run compile
npm -w contracts run test
```

## Architecture

- **Client**: React shell (App.tsx) mounts Phaser canvas via PhaserGame.tsx. Zustand store (`src/state/store.ts`) is cross-component bus. Pure-data systems in `src/game/systems/` (unit testable without Phaser). Data tables in `src/data/`.
- **Server**: `cmd/api/main.go` (entry). Chi router in `internal/httpapi/`. WebSocket at `/ws` (coder/websocket). In-memory seams for all storage (Queue/Ledger interfaces → Redis/Postgres later).
- **Contracts**: Hardhat, Solidity 0.8.24, ethers v6, Mocha+Chai.

## Critical gotchas

- **No ESLint/Prettier** — `npm -w client run lint` is a no-op stub.
- **Vite alias**: `@/` → `client/src/`. Use in all imports.
- **strictPort: true** — Vite dev fails if :5173 already taken.
- **Phaser scene boot order**: `RegistryAwareBoot` class in PhaserGame.tsx captures props (characterId, events) in constructor closure, passes via `scene.start(key, data)`. Do NOT read Phaser registry in BootScene.
- **Server entry**: `go run ./cmd/api`, NOT `go run .` or `go run main.go`.
- **CI order**: client: typecheck → test → build. server: vet → build → test.

## Phase 1 constraints

- No real network calls. `src/network/` (api.ts, realtime.ts, wallet.ts) are stubs.
- `VITE_API_URL` env var sets server URL (default localhost:8080).
- Crypto/wallet features are stubs — don't wire real auth or on-chain flows.
- RealtimeClient never auto-connects (autoConnect=false).

## Game quirks

- **Tester panel**: Press backtick (\`) while playing. Toggle in App.tsx + MainScene.ts.
- **Boss mechanics**: Boss NOT in `enemies` physics group — must add explicit overlap for bullets-vs-boss. HP bar renders as Graphics in MainScene update loop.
- **Legendary skills**: Stored in zustand store. MainScene polls `pendingLegendaryActivation` each frame. Hud sidebar disabled clicks require `pointer-events: auto`.
- **Menu background**: Animated cyberpunk arena (CSS particles/grid/glow/scanlines) in global.css + MainMenu.tsx.

## Testing

- Vitest + jsdom + @testing-library/react. Globals enabled.
- Test files: `src/**/*.{test,spec}.{ts,tsx}`.
- Playwright installed for browser tests.
- No server mock/stub infrastructure yet.

## OpenCode

- `.opencode/plugins/` empty. `.opencode/todo.md` for task tracking.
- No opencode.json, no CLAUDE.md at root. AGENTS.md is the canonical instruction file.
