/**
 * Upgrade table. Each entry has a tier (Common/Rare/Epic/Legendary), a
 * weight (used for the level-up draw), and either a declarative `effect`
 * descriptor or a flag `buildDefining` for the five build-shaping upgrades
 * which set a behavior bit on the player. The effect descriptor is enough
 * for Phase 1's generic stat applier.
 */

export type UpgradeTier = 'common' | 'rare' | 'epic' | 'legendary';

export type StatKey =
  | 'maxHp'
  | 'moveSpeed'
  | 'armor'
  | 'damageMul'
  | 'attackSpeedMul'
  | 'pickupRadius'
  | 'xpGainMul'
  | 'hpRegen'
  | 'critChance'
  | 'critMul'
  | 'dodge'
  | 'lifesteal'
  | 'luck'
  | 'projectileCountBonus';

export type EffectOp = 'add' | 'multiply';

export interface StatEffect {
  kind: 'stat';
  stat: StatKey;
  op: EffectOp;
  value: number;
}

export type BuildKey = 'explosive' | 'poison' | 'chainLightning' | 'drone' | 'orbitOrb';

export interface BuildEffect {
  kind: 'build';
  build: BuildKey;
}

export interface LegendaryEffect {
  kind: 'legendary';
  skillId: 'freeze-blast' | 'purge-bolt';
}

export type UpgradeEffect = StatEffect | BuildEffect | LegendaryEffect;

export interface UpgradeDef {
  id: string;
  tier: UpgradeTier;
  name: string;
  description: string;
  /** Higher = more likely to appear in the level-up draw. */
  weight: number;
  effect: UpgradeEffect;
}

export const TIER_BASE_WEIGHT: Record<UpgradeTier, number> = {
  common: 60,
  rare: 25,
  epic: 12,
  legendary: 3,
};

export const UPGRADES: readonly UpgradeDef[] = [
  // ----- Common (stat bumps) -----
  {
    id: 'damage-1',
    tier: 'common',
    name: 'Sharp Aim',
    description: '+15% weapon damage.',
    weight: 10,
    effect: { kind: 'stat', stat: 'damageMul', op: 'multiply', value: 1.15 },
  },
  {
    id: 'hp-1',
    tier: 'common',
    name: 'Tough Skin',
    description: '+20 max HP and heal to full.',
    weight: 10,
    effect: { kind: 'stat', stat: 'maxHp', op: 'add', value: 20 },
  },
  {
    id: 'regen-1',
    tier: 'common',
    name: 'Field Medic',
    description: '+0.5 HP regen / second.',
    weight: 8,
    effect: { kind: 'stat', stat: 'hpRegen', op: 'add', value: 0.5 },
  },
  {
    id: 'move-1',
    tier: 'common',
    name: 'Light Boots',
    description: '+10% movement speed.',
    weight: 9,
    effect: { kind: 'stat', stat: 'moveSpeed', op: 'multiply', value: 1.1 },
  },
  {
    id: 'attackspeed-1',
    tier: 'common',
    name: 'Quickdraw',
    description: '+12% attack speed.',
    weight: 9,
    effect: { kind: 'stat', stat: 'attackSpeedMul', op: 'multiply', value: 1.12 },
  },
  {
    id: 'pickup-1',
    tier: 'common',
    name: 'Magnet',
    description: '+25% pickup radius.',
    weight: 8,
    effect: { kind: 'stat', stat: 'pickupRadius', op: 'multiply', value: 1.25 },
  },
  {
    id: 'xp-1',
    tier: 'common',
    name: 'Apprentice',
    description: '+15% XP gain.',
    weight: 7,
    effect: { kind: 'stat', stat: 'xpGainMul', op: 'multiply', value: 1.15 },
  },

  // ----- Rare -----
  {
    id: 'crit-chance-1',
    tier: 'rare',
    name: 'Eagle Eye',
    description: '+8% critical strike chance.',
    weight: 6,
    effect: { kind: 'stat', stat: 'critChance', op: 'add', value: 0.08 },
  },
  {
    id: 'crit-mul-1',
    tier: 'rare',
    name: 'Killer Instinct',
    description: '+30% critical damage.',
    weight: 6,
    effect: { kind: 'stat', stat: 'critMul', op: 'add', value: 0.3 },
  },
  {
    id: 'armor-1',
    tier: 'rare',
    name: 'Hardened Plate',
    description: '+2 armor (flat damage reduction).',
    weight: 6,
    effect: { kind: 'stat', stat: 'armor', op: 'add', value: 2 },
  },
  {
    id: 'dodge-1',
    tier: 'rare',
    name: 'Slippery',
    description: '+8% dodge chance.',
    weight: 5,
    effect: { kind: 'stat', stat: 'dodge', op: 'add', value: 0.08 },
  },
  {
    id: 'luck-1',
    tier: 'rare',
    name: 'Four-Leaf',
    description: '+10% luck (better upgrade rolls).',
    weight: 5,
    effect: { kind: 'stat', stat: 'luck', op: 'add', value: 0.1 },
  },
  {
    id: 'projectile-count-1',
    tier: 'rare',
    name: 'Twin Shot',
    description: '+1 projectile to all weapons.',
    weight: 4,
    effect: { kind: 'stat', stat: 'projectileCountBonus', op: 'add', value: 1 },
  },

  // ----- Epic -----
  {
    id: 'lifesteal-1',
    tier: 'epic',
    name: 'Vampiric',
    description: '+5% lifesteal.',
    weight: 3,
    effect: { kind: 'stat', stat: 'lifesteal', op: 'add', value: 0.05 },
  },
  {
    id: 'damage-2',
    tier: 'epic',
    name: 'Annihilator',
    description: '+30% weapon damage.',
    weight: 3,
    effect: { kind: 'stat', stat: 'damageMul', op: 'multiply', value: 1.3 },
  },
  {
    id: 'hp-2',
    tier: 'epic',
    name: 'Iron Heart',
    description: '+50 max HP.',
    weight: 3,
    effect: { kind: 'stat', stat: 'maxHp', op: 'add', value: 50 },
  },

  // ----- Build-defining (rare/epic/legendary) -----
  {
    id: 'build-explosive',
    tier: 'epic',
    name: 'Explosive Bullets',
    description: 'Projectiles detonate on impact for splash damage.',
    weight: 2,
    effect: { kind: 'build', build: 'explosive' },
  },
  {
    id: 'build-poison',
    tier: 'rare',
    name: 'Toxic Rounds',
    description: 'Hits apply a damage-over-time poison.',
    weight: 2,
    effect: { kind: 'build', build: 'poison' },
  },
  {
    id: 'build-chain',
    tier: 'epic',
    name: 'Chain Lightning',
    description: 'Hits arc to a nearby enemy for half damage.',
    weight: 2,
    effect: { kind: 'build', build: 'chainLightning' },
  },
  {
    id: 'build-drone',
    tier: 'legendary',
    name: 'Drone Companion',
    description: 'A drone follows you and fires at the nearest enemy.',
    weight: 1,
    effect: { kind: 'build', build: 'drone' },
  },
  {
    id: 'build-orb',
    tier: 'legendary',
    name: 'Orbiting Magic Orb',
    description: 'A glowing orb circles you, damaging anything it touches.',
    weight: 1,
    effect: { kind: 'build', build: 'orbitOrb' },
  },
  {
    id: 'legendary-freeze-blast',
    tier: 'legendary',
    name: 'Freeze Blast',
    description: 'Freeze all non-boss enemies for 3-5 seconds. Usable once per run.',
    weight: 2,
    effect: { kind: 'legendary', skillId: 'freeze-blast' },
  },
  {
    id: 'legendary-purge-bolt',
    tier: 'legendary',
    name: 'Purge Bolt',
    description: 'Instantly kill all non-boss enemies on screen. Usable once per run.',
    weight: 2,
    effect: { kind: 'legendary', skillId: 'purge-bolt' },
  },
];

export function getUpgrade(id: string): UpgradeDef {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) throw new Error(`Unknown upgrade id: ${id}`);
  return u;
}
