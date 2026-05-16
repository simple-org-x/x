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
  single map, guest mode only, single-player loop. **[implemented]**
- **Phase 2:** Full content tables (3 chars / 5 weapons / 20 upgrades / 10
  enemy types), matchmaking queue, optional wallet connect. **[scaffolded]**
- **Phase 3:** Server-authoritative multiplayer, leaderboards, daily runs.
  **[scaffolded]**
- **Phase 4:** On-chain reward pool, cosmetic NFT drops, tournament escrow.
  **[scaffolded]**
- **Phase 5:** Full Kubernetes + Terraform deploy with Prometheus/Grafana.
  **[scaffolded]**

Phase 1 is playable end-to-end (`make dev-client`). Phases 2-5 have their
data tables, server endpoints, smart contracts, and infrastructure manifests
in place but require feature work to wire them into the gameplay loop.

## Architecture

```
                     +-----------------------------+
                     |        Cloudflare DNS       |
                     |   play.* + api.* (proxied)  |
                     +--------------+--------------+
                                    |
                          +---------+---------+
                          |  Kubernetes (EKS) |
                          |  ingress-nginx    |
                          +----+----------+---+
                               |          |
                  +------------+--+    +--+----------------+
                  |  cas-client    |    |  cas-server (HPA) |
                  |  React+Phaser  |    |  Go HTTP+WS API   |
                  |  nginx:80      |    |  /healthz /readyz |
                  +-------+--------+    |  /metrics         |
                          |             +-+----+--------+---+
                          | REST + WS     |    |        |
                          +---------------+    |        |
                                               |        |
                                  +------------+        +-----------+
                                  |                                 |
                          +-------+--------+               +--------+--------+
                          |  Redis 7       |               |  Postgres 16    |
                          |  matchmaking   |               |  ledger / users |
                          |  queue + cache |               |  with PVC       |
                          +----------------+               +--------+--------+
                                                                    |
                                                                    | server-signed
                                                                    | settlements
                                                                    v
                                                          +---------+--------+
                                                          |  EVM contracts   |
                                                          |  RewardPool      |
                                                          |  TournamentEscrow|
                                                          |  CosmeticNFT     |
                                                          +------------------+
```

The client never talks to chain directly for gameplay. The Go server is the
sole signer for reward settlements; the smart contracts only accept claims
backed by a server signature. Cosmetic NFTs are ERC-1155 and never affect
stats.

## How crypto rewards work

Crypto is fully optional. Guests play the loop in their browser without ever
seeing a wallet prompt. For players who do connect a wallet, the reward flow
is intentionally narrow:

1. **Entry fee.** A wallet-authenticated player joins a paid match by calling
   `RewardPool.deposit(matchId)` with a fixed entry fee. The contract escrows
   the funds and emits `Deposited(player, matchId, amount)`.
2. **Server-authoritative match.** The Go server runs the match (matchmaking,
   simulation tick loop, anti-cheat checks). Game outcome is determined off
   chain because on-chain simulation would be both slow and gameable.
3. **Server-signed settlement.** When the match ends, the server's signer key
   produces an EIP-712 settlement payload listing winners and amounts. The
   payload is hashed and signed; the signature plus payload is returned to
   the client and any indexer.
4. **Player claim.** Winning players (or a relayer) submit the payload and
   signature to `RewardPool.claim(...)`. The contract verifies the signature
   against a known signer set (rotated via `AccessControl`) and pays out from
   escrow. Losing players' deposits stay in the pool for the next round, or
   are refunded if a match aborts.
5. **Cosmetic NFT drops.** Cosmetic skins are minted from `CosmeticNFT`
   (ERC-1155). They have zero stat effect and exist purely for vanity.

This separation keeps gameplay fast and fair while letting players self
custody both deposits and winnings: the server cannot mint funds it does not
have, and players cannot claim funds the server has not signed off on.

## Anti pay-to-win pledge

Crypto Arena Survivors is committed to keeping the playing field even:

- **No stat-affecting purchases, ever.** Nothing on chain or off chain
  changes damage, health, speed, weapon firing rates, drop tables, or any
  other gameplay number. Cosmetic NFTs are skins only.
- **Guest mode is a first-class citizen.** The full single-player loop, all
  characters, all weapons, and all upgrades are available without a wallet.
- **No paid loot boxes.** The upgrade pool is identical for paying and
  non-paying players. Match outcomes derive only from input and the seeded
  RNG.
- **Auditability.** Reward settlements are server-signed and replayable; any
  observer can verify a payout corresponds to a real match outcome by
  checking the EIP-712 signature against the published signer set.
- **Cosmetic NFTs are optional and tradable.** Players who do not want
  on-chain assets simply do not connect a wallet and never see them.

## Per-component documentation

Each subdirectory has its own `README.md` with details:

- [client/README.md](client/README.md)
- [server/README.md](server/README.md)
- [contracts/README.md](contracts/README.md)
- [infrastructure/README.md](infrastructure/README.md)
