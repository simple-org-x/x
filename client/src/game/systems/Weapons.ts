import { getWeapon, type WeaponDef, type WeaponId } from '@/data/weapons';
import type { PlayerState } from './Player';

/** Per-weapon runtime state: cooldown timer. */
export interface WeaponRuntime {
  id: WeaponId;
  /** Time in ms remaining before this weapon can fire again. */
  cooldownRemainingMs: number;
}

export function makeWeaponRuntime(id: WeaponId): WeaponRuntime {
  return { id, cooldownRemainingMs: 0 };
}

/**
 * Compute the effective cooldown for a weapon for a given player. Higher
 * `attackSpeedMul` shortens the cooldown.
 */
export function effectiveCooldownMs(weapon: WeaponDef, player: PlayerState): number {
  const mul = Math.max(0.1, player.stats.attackSpeedMul);
  return weapon.cooldownMs / mul;
}

/**
 * Compute the effective projectile count for a weapon. The player's
 * `projectileCountBonus` is added flatly across all weapons.
 */
export function effectiveProjectileCount(weapon: WeaponDef, player: PlayerState): number {
  return Math.max(1, weapon.projectileCount + Math.floor(player.stats.projectileCountBonus));
}

/**
 * Compute effective per-projectile damage including the player's damage
 * multiplier. Crits are resolved per-shot at fire time, not here.
 */
export function effectiveDamage(weapon: WeaponDef, player: PlayerState): number {
  return weapon.damage * player.stats.damageMul;
}

/** Roll a crit and return the post-crit damage. */
export function rollDamage(base: number, player: PlayerState, rng: () => number = Math.random): number {
  if (rng() < player.stats.critChance) {
    return base * player.stats.critMul;
  }
  return base;
}

/**
 * Reduce all cooldowns by `deltaMs` and return the list of weapons that are
 * ready to fire this frame.
 */
export function tickWeapons(
  runtimes: WeaponRuntime[],
  deltaMs: number,
  player: PlayerState,
): WeaponRuntime[] {
  const ready: WeaponRuntime[] = [];
  for (const rt of runtimes) {
    rt.cooldownRemainingMs = Math.max(0, rt.cooldownRemainingMs - deltaMs);
    if (rt.cooldownRemainingMs <= 0) {
      const w = getWeapon(rt.id);
      if (!w.available) continue;
      ready.push(rt);
      rt.cooldownRemainingMs = effectiveCooldownMs(w, player);
    }
  }
  return ready;
}

/**
 * Compute the spread angles in radians for a fan of `count` projectiles
 * spanning `spreadDeg` degrees centered on `aimAngleRad`.
 */
export function fanAngles(aimAngleRad: number, count: number, spreadDeg: number): number[] {
  if (count <= 1) return [aimAngleRad];
  const spread = (spreadDeg * Math.PI) / 180;
  const step = spread / (count - 1);
  const start = aimAngleRad - spread / 2;
  return Array.from({ length: count }, (_, i) => start + step * i);
}

export { getWeapon };
export type { WeaponDef, WeaponId };
