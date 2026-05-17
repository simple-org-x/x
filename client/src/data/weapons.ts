/**
 * Weapon definitions. Phase 1 mechanically wires Pistol and Shotgun via
 * their `available` flag; the other three (Laser, RocketLauncher, Katana)
 * are present in the data table for future content work.
 */

export type WeaponId = 'pistol' | 'shotgun' | 'laser' | 'rocket' | 'katana';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Base cooldown between shots in ms. */
  cooldownMs: number;
  /** Number of projectiles fired per shot. */
  projectileCount: number;
  /** Damage per projectile (pre-character multiplier). */
  damage: number;
  /** Maximum target acquisition range in pixels. */
  range: number;
  /** Projectile speed in px/sec. */
  projectileSpeed: number;
  /** Number of enemies a single projectile can pierce (0 = single target). */
  pierce: number;
  /** Spread angle in degrees applied across projectiles for shotgun-style fans. */
  spreadDeg: number;
  /** AoE radius on impact (0 = no AoE). */
  aoeRadius: number;
  /** Hex color used for the procedural projectile texture. */
  color: number;
  /** Short flavor description for the UI. */
  description: string;
  /** When false the weapon exists in data but Phase 1 does not implement firing logic. */
  available: boolean;
}

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: 'pistol',
    name: 'Sidearm Pistol',
    cooldownMs: 600,
    projectileCount: 1,
    damage: 12,
    range: 360,
    projectileSpeed: 520,
    pierce: 0,
    spreadDeg: 0,
    aoeRadius: 0,
    color: 0xfff4a8,
    description: 'Reliable single-target damage. Locks onto the nearest enemy.',
    available: true,
  },
  {
    id: 'shotgun',
    name: 'Pump Shotgun',
    cooldownMs: 1100,
    projectileCount: 5,
    damage: 7,
    range: 240,
    projectileSpeed: 460,
    pierce: 0,
    spreadDeg: 28,
    aoeRadius: 0,
    color: 0xff9466,
    description: 'Five-pellet spread cone. Murderous up close.',
    available: true,
  },
  {
    id: 'laser',
    name: 'Pulse Laser',
    cooldownMs: 900,
    projectileCount: 1,
    damage: 16,
    range: 520,
    projectileSpeed: 900,
    pierce: 3,
    spreadDeg: 0,
    aoeRadius: 0,
    color: 0x5cf7c4,
    description: 'A pierce-through beam. (Coming soon)',
    available: false,
  },
  {
    id: 'rocket',
    name: 'Rocket Launcher',
    cooldownMs: 1800,
    projectileCount: 1,
    damage: 30,
    range: 420,
    projectileSpeed: 280,
    pierce: 0,
    spreadDeg: 0,
    aoeRadius: 90,
    color: 0xff5d8f,
    description: 'Slow projectile, big boom. (Coming soon)',
    available: false,
  },
  {
    id: 'katana',
    name: 'Plasma Katana',
    cooldownMs: 500,
    projectileCount: 1,
    damage: 22,
    range: 90,
    projectileSpeed: 0,
    pierce: 99,
    spreadDeg: 360,
    aoeRadius: 90,
    color: 0xa35cff,
    description: 'Melee arc swing around the player. (Coming soon)',
    available: false,
  },
];

export function getWeapon(id: WeaponId): WeaponDef {
  const w = WEAPONS.find((x) => x.id === id);
  if (!w) throw new Error(`Unknown weapon id: ${id}`);
  return w;
}
