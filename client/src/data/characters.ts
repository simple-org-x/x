/**
 * Character roster. Phase 1 only fully wires Potato Soldier; the other two
 * appear in the character select UI but are gated by the `comingSoon` flag.
 */

import type { WeaponId } from './weapons';

export type CharacterId = 'potato-soldier' | 'robot-cube' | 'ninja-cat';

export interface CharacterStats {
  /** Maximum hit points. */
  maxHp: number;
  /** Tiles per second base movement speed. */
  moveSpeed: number;
  /** Flat damage taken reduction (post-multiplier). */
  armor: number;
  /** Multiplier on weapon damage; 1.0 = no change. */
  damageMul: number;
  /** Multiplier on weapon attack speed (lower cooldown is better). */
  attackSpeedMul: number;
  /** Pickup radius for XP gems and coins. */
  pickupRadius: number;
  /** Multiplier applied to XP gained from gems. */
  xpGainMul: number;
  /** Per-second HP regen. */
  hpRegen: number;
  /** Probability [0,1] to crit. */
  critChance: number;
  /** Multiplier applied on crit hits. */
  critMul: number;
  /** Probability [0,1] to dodge a hit entirely. */
  dodge: number;
  /** Lifesteal fraction of damage dealt returned as HP. */
  lifesteal: number;
  /** Drop-rate luck modifier; affects upgrade tier weighting. */
  luck: number;
  /** Number of projectiles added across all weapons. */
  projectileCountBonus: number;
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  /** Hex color used to tint the procedural sprite. */
  color: number;
  /** Short tagline displayed on the character select card. */
  tagline: string;
  /** Starting weapon equipped on spawn. */
  startingWeapon: WeaponId;
  /** Base stats applied when this character is selected. */
  stats: CharacterStats;
  /** When true the character is visible in select but not playable yet. */
  comingSoon?: boolean;
}

const baseStats: CharacterStats = {
  maxHp: 100,
  moveSpeed: 200,
  armor: 0,
  damageMul: 1.0,
  attackSpeedMul: 1.0,
  pickupRadius: 80,
  xpGainMul: 1.0,
  hpRegen: 0.5,
  critChance: 0.05,
  critMul: 1.5,
  dodge: 0,
  lifesteal: 0,
  luck: 0,
  projectileCountBonus: 0,
};

export const CHARACTERS: readonly CharacterDef[] = [
  {
    id: 'potato-soldier',
    name: 'Potato Soldier',
    color: 0xd4a05a,
    tagline: 'Sturdy starter with balanced stats and a trusty pistol.',
    startingWeapon: 'pistol',
    stats: { ...baseStats },
  },
  {
    id: 'robot-cube',
    name: 'Robot Cube',
    color: 0x6f8cff,
    tagline: 'Heavy chassis: more HP, slower feet, big shotgun blasts.',
    startingWeapon: 'shotgun',
    stats: {
      ...baseStats,
      maxHp: 140,
      moveSpeed: 175,
      armor: 2,
      damageMul: 1.05,
      attackSpeedMul: 0.9,
    },
    comingSoon: true,
  },
  {
    id: 'ninja-cat',
    name: 'Ninja Cat',
    color: 0xff8ad1,
    tagline: 'Glass cannon: light, fast, crits hard, dodges often.',
    startingWeapon: 'katana',
    stats: {
      ...baseStats,
      maxHp: 80,
      moveSpeed: 240,
      critChance: 0.12,
      critMul: 1.75,
      dodge: 0.1,
      attackSpeedMul: 1.15,
    },
    comingSoon: true,
  },
];

export function getCharacter(id: CharacterId): CharacterDef {
  const c = CHARACTERS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown character id: ${id}`);
  return c;
}
