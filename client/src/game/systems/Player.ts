import type { CharacterDef, CharacterStats } from '@/data/characters';
import type { WeaponId } from '@/data/weapons';
import type { BuildKey } from '@/data/upgrades';

/**
 * Pure-data player snapshot. The Phaser scene owns the actual sprite/body;
 * this module owns the canonical stats/builds so they can be unit tested
 * without touching Phaser at all.
 */
export interface PlayerState {
  characterId: string;
  /** Effective stats (mutated by upgrades). */
  stats: CharacterStats;
  hp: number;
  level: number;
  xp: number;
  /** XP required to reach the next level. */
  xpToNext: number;
  /** Weapons currently equipped. */
  weapons: WeaponId[];
  /** Set of build modifiers granted by build-defining upgrades. */
  builds: Set<BuildKey>;
  /** Total kills this run. */
  kills: number;
}

export function makePlayerState(character: CharacterDef): PlayerState {
  return {
    characterId: character.id,
    stats: { ...character.stats },
    hp: character.stats.maxHp,
    level: 1,
    xp: 0,
    xpToNext: xpRequiredForLevel(2),
    weapons: [character.startingWeapon],
    builds: new Set<BuildKey>(),
    kills: 0,
  };
}

/**
 * Soft exponential XP curve. Level 2 needs 5, level 3 needs 8, etc.
 * Picked to give a level roughly every ~10s in the early game with the
 * Phase 1 spawn rate.
 */
export function xpRequiredForLevel(level: number): number {
  return Math.floor(4 + Math.pow(level - 1, 1.4) * 3);
}

export function gainXp(p: PlayerState, amount: number): { leveledUp: boolean } {
  const gained = Math.max(0, Math.floor(amount * p.stats.xpGainMul));
  p.xp += gained;
  let leveled = false;
  while (p.xp >= p.xpToNext) {
    p.xp -= p.xpToNext;
    p.level += 1;
    p.xpToNext = xpRequiredForLevel(p.level + 1);
    leveled = true;
  }
  return { leveledUp: leveled };
}

/** Apply incoming damage with armor + dodge. Returns the final HP delta. */
export function applyIncomingDamage(p: PlayerState, raw: number, rng: () => number = Math.random): number {
  if (rng() < p.stats.dodge) return 0;
  const dmg = Math.max(1, raw - p.stats.armor);
  p.hp = Math.max(0, p.hp - dmg);
  return dmg;
}

export function tickHpRegen(p: PlayerState, deltaSec: number): void {
  if (p.hp <= 0) return;
  p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.hpRegen * deltaSec);
}
