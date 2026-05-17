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

- **Client**: React shell (App.tsx) mounts Phaser canvas via PhaserGame.tsx. Zustand store (`src/state/store.ts`) is cross-component bus. Pure-data systems in `src/game/systems/` (unit testable without Phaser). Data tables in `src/data/`. i18n system with EN/ID language support via `src/i18n/`.
- **Server**: `cmd/api/main.go` (entry). Chi router in `internal/httpapi/`. WebSocket at `/ws` (coder/websocket). In-memory seams for all storage (Queue/Ledger interfaces → Redis/Postgres later). Endpoints: auth (guest/wallet), matchmaking (queue), game server (match lifecycle), rewards (ledger), realtime (WebSocket).
- **Contracts**: Hardhat, Solidity 0.8.24, ethers v6, Mocha+Chai.

## Game Features (15 implemented)

**Core Gameplay**:
- Multi-boss system: 4 boss variants (Warden/Crimson Reaver/Void Monarch/Storm Titan) spawn at levels 10/20/30, scaling HP +60%, damage +30%, bullets +25% per encounter
- Infinite survival mode (no level cap, no time limit)
- Boss kill celebration: particle burst + "BOSS DEFEATED!" text + gold flash + camera shake
- Legendary skills: Freeze Blast (3-5s freeze non-boss enemies, cyan tint) + Purge Bolt (kill all non-boss)
- Skills sidebar: active skills shown with tier colors, legendary buttons with charges
- Level-up challenges: legendary cards appear naturally in upgrade draws (tier=legendary, weight=2)

**UI/UX**:
- Username system: prompt on first play, displayed below character sprite, localStorage persisted
- Game records + leaderboard: sorted by bossKills desc → level desc → timeSec desc, max 50 records
- Pause/Resume with ESC key: PauseOverlay component, game stays mounted during pause
- Boss HP bar + name display: 200px red fill bar, golden name text, updated each frame
- Particle effects: red burst on boss spawn (30), gold burst on boss death (50), pink burst on player death (40)
- Coin rewards: base 50 per boss, scales by `1 + (bossNumber-1)*0.6`
- Skill list navigation: shows all upgrades grouped by tier with drop chances
- Enhanced username input: terminal aesthetic with monospace font, blinking cursor, status indicator
- i18n support: English + Bahasa Indonesia, language toggle in main menu, persists to localStorage

**Developer Tools**:
- Tester panel: Press backtick (`) to toggle. Sections: XP/Level, Boss (spawn/kill), Player (heal/god mode), Speed (0.5/1/2/4x)
- Dev hooks: gainXp, forceLevelUp, spawnBossNow, killBoss, toggleGodMode, setSpeed, healFull, jumpToLevel, grantFreezeBlast, grantPurgeBolt
- Boss bestiary: shows all 4 bosses with stats, skills, HP scaling preview

**Backend Features** (Go server):
- Authentication: guest JWT, EIP-191 wallet login with nonce verification
- Matchmaking: queue system with MMR-based bucketing, solo queue short-circuits to synthetic match
- Game server: per-match goroutine runner (30Hz tick), match lifecycle management
- Realtime: WebSocket hub for live updates
- Rewards: prize-pool ledger with distribution tracking
- Infrastructure: Prometheus metrics, health checks, graceful shutdown, per-IP rate limiting

## Critical gotchas

- **No ESLint/Prettier** — `npm -w client run lint` is a no-op stub.
- **Vite alias**: `@/` → `client/src/`. Use in all imports.
- **strictPort: true** — Vite dev fails if :5173 already taken.
- **Phaser scene boot order**: `RegistryAwareBoot` class in PhaserGame.tsx captures props (characterId, events) in constructor closure, passes via `scene.start(key, data)`. Do NOT read Phaser registry in BootScene.
- **Server entry**: `go run ./cmd/api`, NOT `go run .` or `go run main.go`.
- **CI order**: client: typecheck → test → build. server: vet → build → test.
- **Boss collision**: Boss NOT in `enemies` physics group — must add explicit overlap for bullets-vs-boss via `this.physics.add.overlap(this.bullets, this.boss, ...)` in spawnBoss().
- **Legendary skills**: Stored in zustand store. MainScene polls `pendingLegendaryActivation` each frame. Hud sidebar disabled clicks require `pointer-events: auto`.
- **i18n**: All UI components must use `useI18n()` hook + `t()` calls. Translation keys in `src/i18n/en.json` and `src/i18n/id.json`.
- **UpgradePicker**: Must use i18n for level-up card titles/subtitles (was hardcoded English, now fixed).

## Phase 1 constraints

- No real network calls. `src/network/` (api.ts, realtime.ts, wallet.ts) are stubs.
- `VITE_API_URL` env var sets server URL (default localhost:8080).
- Crypto/wallet features are stubs — don't wire real auth or on-chain flows.
- RealtimeClient never auto-connects (autoConnect=false).
- Coins persisted to localStorage (prep for future crypto conversion).

## Game quirks

- **Tester panel**: Press backtick (\`) while playing. Toggle in App.tsx + MainScene.ts. Shows dev hooks for testing.
- **Boss mechanics**: Boss NOT in `enemies` physics group — must add explicit overlap for bullets-vs-boss. HP bar renders as Graphics in MainScene update loop.
- **Legendary skills**: Stored in zustand store. MainScene polls `pendingLegendaryActivation` each frame. Hud sidebar disabled clicks require `pointer-events: auto`.
- **Menu background**: Animated cyberpunk arena (CSS particles/grid/glow/scanlines) in global.css + MainMenu.tsx.
- **Username input**: Terminal aesthetic with monospace font, blinking cursor, champion's plaque for existing username.
- **Boss bestiary**: Accessible from main menu, shows all 4 bosses with stats, skills, HP scaling preview.

## Testing

- Vitest + jsdom + @testing-library/react. Globals enabled.
- Test files: `src/**/*.{test,spec}.{ts,tsx}`.
- Playwright installed for browser tests.
- No server mock/stub infrastructure yet.

## Build Output

- Client: ~192kB JS (gzipped 60kB) + 1.5MB Phaser chunk (gzipped 348kB) + 20kB CSS (gzipped 4.7kB)
- Total: ~1.7MB uncompressed, ~413kB gzipped

## OpenCode

- `.opencode/plugins/` empty. `.opencode/todo.md` for task tracking.
- No opencode.json, no CLAUDE.md at root. AGENTS.md is the canonical instruction file.
- Skills available: brainstorming, test-driven-development, systematic-debugging, verification-before-completion, frontend-design, etc.
