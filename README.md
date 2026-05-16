# Crypto Arena Survivors

> A browser-based auto-battler / arena survival roguelite with optional crypto
> rewards. Movement is the only thing the player controls; weapons fire on
> their own timers, upgrades drop in rarity tiers, and a boss arrives roughly
> every three minutes. Crypto is strictly opt-in: guests can play the entire
> loop without a wallet, and nothing purchasable ever affects gameplay stats.

## Vision

Crypto Arena Survivors is a fast-paced, replayable arena shooter inspired by
the bullet-heaven genre. The Phase 1 prototype targets a single playable
character, two weapons (pistol + shotgun), five upgrades, one boss, and a
single arena -- enough to ship a runnable loop. Subsequent phases expand the
content tables (3 characters / 5 weapons / 20 upgrades / 10 enemy types) and
layer in matchmaking, server-authoritative play, and an optional on-chain
reward pool for tournament payouts and cosmetic NFTs.

## Recommended stack

| Layer            | Tech                                                   |
|------------------|--------------------------------------------------------|
| Game client      | React + Phaser.js + TypeScript, bundled with Vite      |
| Game server      | Go (HTTP + WebSocket) -- auth, matchmaking, rewards    |
| Reward indexer   | Node.js (lightweight, optional)                        |
| Smart contracts  | Solidity on EVM, developed with Hardhat                |
| Infrastructure   | Kubernetes, Terraform, Cloudflare, Prometheus/Grafana  |
| CI/CD            | Google Cloud Build (`cloudbuild.yaml` at repo root)    |

## Repository layout

```
.
|-- client/          React + Phaser + Vite game client (TypeScript)
|-- server/          Go services: auth, matchmaking, gameserver, rewards
|-- contracts/       Hardhat project: RewardPool, CosmeticNFT, TournamentEscrow
|-- infrastructure/  Terraform, Kubernetes manifests, Prometheus/Grafana
|-- cloudbuild.yaml  Google Cloud Build trigger (do not edit casually)
|-- Makefile         Top-level orchestration
|-- package.json     npm workspaces root (client + contracts)
```

`server/` is a Go module, not an npm workspace.

## Quick start

Prerequisites: Node.js >= 20, Go >= 1.22, Docker (optional, for image builds).

```bash
make install        # install npm workspaces + go mod download
make build          # build client, server, contracts
make test           # run all test suites
make dev-client     # Vite dev server at http://localhost:5173
make dev-server     # Go API + WebSocket server on :8080
```

The Makefile is tolerant: targets guard each step with file-existence checks
so the skeleton (without yet-to-land subprojects) still exits cleanly.

## Design pillars

1. **Server-authoritative gameplay** -- even the single-player Phase 1 client
   keeps a clean network seam so multiplayer can be bolted on.
2. **Crypto is optional** -- guest mode plays the whole game without a wallet.
3. **No pay-to-win** -- nothing on-chain or off-chain affects stats. Cosmetic
   NFTs are ERC-1155 skins only.
4. **Mobile-first input** -- support both WASD/arrow keys and a virtual
   joystick.
5. **Auto-attack combat** -- the player controls movement; weapons fire on
   their own timers.
6. **Rarity-tiered upgrades** -- Common, Rare, Epic, Legendary.

## Roadmap

- **Phase 1 (MVP prototype):** 1 character, 2 weapons, 5 upgrades, 1 boss,
  single map, guest mode only, single-player loop.
- **Phase 2:** Full content tables (3 chars / 5 weapons / 20 upgrades / 10
  enemy types), matchmaking queue, optional wallet connect.
- **Phase 3:** Server-authoritative multiplayer, leaderboards, daily runs.
- **Phase 4:** On-chain reward pool, cosmetic NFT drops, tournament escrow.
- **Phase 5:** Full Kubernetes + Terraform deploy with Prometheus/Grafana.

## Per-component documentation

Each subdirectory has its own `README.md` with details:

- [client/README.md](client/README.md)
- [server/README.md](server/README.md)
- [contracts/README.md](contracts/README.md)
- [infrastructure/README.md](infrastructure/README.md)
