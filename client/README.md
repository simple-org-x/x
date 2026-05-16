# client/

React + Phaser.js + Vite + TypeScript game client for **Crypto Arena
Survivors**. This package is an npm workspace declared in the root
`package.json` (`@cas/client`).

## Phase 1 (this feature)

- React shell at `src/App.tsx` orchestrates a top bar, a Phaser canvas,
  the HUD overlay, and the upgrade picker / menu overlays.
- A small zustand store (`src/state/store.ts`) is the cross-component bus.
- A Phaser game host (`src/game/PhaserGame.tsx`) mounts two scenes:
  - `BootScene` bakes every sprite procedurally with `Graphics.generateTexture`.
  - `MainScene` runs the gameplay loop: WASD + virtual joystick movement,
    auto-firing weapons, waved enemies, XP gems, level-up upgrade picker,
    boss spawn at 3:00, victory at 15:00.
- Pure-data systems live under `src/game/systems/` (`Player`, `Weapons`,
  `Enemies`, `Upgrades`, `Boss`) and are unit tested without Phaser.
- Data tables live under `src/data/`:
  - `characters.ts` (3 entries; Phase 1 fully wires Potato Soldier)
  - `weapons.ts` (5 entries; Phase 1 wires Pistol + Shotgun)
  - `enemies.ts` (10 archetypes; first 5 spawn early, rest unlock by wave 6)
  - `upgrades.ts` (>=20 entries across Common/Rare/Epic/Legendary tiers)
- Network stubs at `src/network/` (`api.ts`, `wallet.ts`, `realtime.ts`).

## Scripts

```bash
npm -w client install
npm -w client run dev        # Vite dev server on :5173
npm -w client run build      # Production bundle to client/dist
npm -w client run preview    # Static preview of the build
npm -w client run test       # Vitest run, all suites
npm -w client run typecheck  # tsc --noEmit
```

## Inputs

- Desktop: `WASD` or arrow keys.
- Touch: drag the on-screen virtual joystick (bottom-left).

## Out of scope for Phase 1

Crypto and multiplayer are stubs only. `network/wallet.ts` simulates a guest
session and `network/realtime.ts` exposes a typed WebSocket client that does
not auto-connect. Those will land in subsequent features.
