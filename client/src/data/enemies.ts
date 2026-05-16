/**
 * Enemy archetypes. Ten entries; Phase 1 spawn logic uses the first five
 * (basic-grunt, fast-runner, swarmling, charger, ranged-shooter) in early
 * waves and unlocks the remaining five (tank, exploder, splitter, healer,
 * elite) once the run has progressed past the unlock threshold.
 */

export type EnemyShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'pentagon';

export type EnemyAi =
  | 'chase' // walks straight toward the player
  | 'fast-chase' // walks faster, lower hp
  | 'kite' // keeps distance, fires periodic projectile
  | 'charge' // stops, telegraphs, then dashes
  | 'explode' // chases then self-destructs at melee range
  | 'swarm' // chases in groups, low hp
  | 'split' // chases; on death spawns 2 swarmlings
  | 'heal' // chases slowly; periodically heals nearby enemies
  | 'tanky' // chases very slowly, very high hp
  | 'elite-mix'; // mid boss: chase + occasional ranged volley

export type EnemyId =
  | 'basic-grunt'
  | 'fast-runner'
  | 'swarmling'
  | 'charger'
  | 'ranged-shooter'
  | 'tank'
  | 'exploder'
  | 'splitter'
  | 'healer'
  | 'elite';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  damage: number;
  /** Move speed in px/sec. */
  speed: number;
  ai: EnemyAi;
  shape: EnemyShape;
  color: number;
  /** Approximate radius in px (used for both rendering and collision). */
  radius: number;
  /** XP dropped on death. */
  xp: number;
  /** Wave index at which this enemy starts spawning. */
  unlockWave: number;
}

export const ENEMIES: readonly EnemyDef[] = [
  {
    id: 'basic-grunt',
    name: 'Grunt',
    hp: 18,
    damage: 6,
    speed: 70,
    ai: 'chase',
    shape: 'circle',
    color: 0xff5d5d,
    radius: 12,
    xp: 1,
    unlockWave: 0,
  },
  {
    id: 'fast-runner',
    name: 'Runner',
    hp: 10,
    damage: 4,
    speed: 130,
    ai: 'fast-chase',
    shape: 'triangle',
    color: 0xff9a3d,
    radius: 10,
    xp: 1,
    unlockWave: 1,
  },
  {
    id: 'swarmling',
    name: 'Swarmling',
    hp: 6,
    damage: 3,
    speed: 95,
    ai: 'swarm',
    shape: 'diamond',
    color: 0xc6ff5d,
    radius: 8,
    xp: 1,
    unlockWave: 1,
  },
  {
    id: 'charger',
    name: 'Charger',
    hp: 28,
    damage: 12,
    speed: 60,
    ai: 'charge',
    shape: 'pentagon',
    color: 0xff5dd6,
    radius: 14,
    xp: 2,
    unlockWave: 2,
  },
  {
    id: 'ranged-shooter',
    name: 'Sniper',
    hp: 14,
    damage: 8,
    speed: 55,
    ai: 'kite',
    shape: 'triangle',
    color: 0x5dc6ff,
    radius: 11,
    xp: 2,
    unlockWave: 2,
  },
  {
    id: 'tank',
    name: 'Bulwark',
    hp: 80,
    damage: 14,
    speed: 38,
    ai: 'tanky',
    shape: 'square',
    color: 0x8a8d99,
    radius: 18,
    xp: 5,
    unlockWave: 4,
  },
  {
    id: 'exploder',
    name: 'Exploder',
    hp: 12,
    damage: 22,
    speed: 80,
    ai: 'explode',
    shape: 'circle',
    color: 0xffce5d,
    radius: 12,
    xp: 3,
    unlockWave: 4,
  },
  {
    id: 'splitter',
    name: 'Splitter',
    hp: 22,
    damage: 6,
    speed: 70,
    ai: 'split',
    shape: 'diamond',
    color: 0x5d8aff,
    radius: 13,
    xp: 3,
    unlockWave: 5,
  },
  {
    id: 'healer',
    name: 'Mender',
    hp: 26,
    damage: 2,
    speed: 50,
    ai: 'heal',
    shape: 'pentagon',
    color: 0x5dffae,
    radius: 12,
    xp: 4,
    unlockWave: 5,
  },
  {
    id: 'elite',
    name: 'Elite',
    hp: 120,
    damage: 16,
    speed: 70,
    ai: 'elite-mix',
    shape: 'square',
    color: 0xff3060,
    radius: 18,
    xp: 8,
    unlockWave: 6,
  },
];

export function getEnemy(id: EnemyId): EnemyDef {
  const e = ENEMIES.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown enemy id: ${id}`);
  return e;
}

/** Phase 1 helper: pick eligible enemy archetypes for a given wave. */
export function enemiesForWave(wave: number): readonly EnemyDef[] {
  return ENEMIES.filter((e) => e.unlockWave <= wave);
}
