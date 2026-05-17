import { ENEMIES, enemiesForWave, type EnemyDef, type EnemyId } from '@/data/enemies';

export { ENEMIES, enemiesForWave };
export type { EnemyDef, EnemyId };

/**
 * Pick an enemy archetype for the given wave using weighted random
 * selection. Earlier-unlocked archetypes are slightly more common so that
 * later waves still feel mixed rather than wall-to-wall elites.
 */
export function pickEnemyForWave(wave: number, rng: () => number = Math.random): EnemyDef {
  const eligible = enemiesForWave(wave);
  if (eligible.length === 0) {
    return ENEMIES[0]!;
  }
  const weights = eligible.map((e) => 1 / (1 + (wave - e.unlockWave) * 0.05) + 0.4);
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < eligible.length; i += 1) {
    roll -= weights[i]!;
    if (roll <= 0) return eligible[i]!;
  }
  return eligible[eligible.length - 1]!;
}

/**
 * Number of enemies to spawn in a given wave. Roughly linear with a soft
 * floor and ceiling so the prototype stays runnable on lower-end devices.
 */
export function spawnCountForWave(wave: number): number {
  return Math.min(40, 4 + wave * 2);
}

/** Seconds between waves. */
export const WAVE_INTERVAL_SEC = 14;
