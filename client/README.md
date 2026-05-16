# client/

React + Phaser.js + Vite + TypeScript game client for Crypto Arena Survivors.
This package is an npm workspace declared in the root `package.json` and is
where the Phase 1 playable prototype lives: scenes, systems, and entities
under `src/game/`, the React HUD/menu shell under `src/ui/`, the REST and
WebSocket networking layer under `src/network/`, procedurally generated
placeholder art under `src/assets/`, and data tables (characters, weapons,
upgrades, enemies) under `src/data/`. Real implementation lands in FEAT-002.
