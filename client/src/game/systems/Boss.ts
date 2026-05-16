/**
 * Boss state machine. Phase 1 ships one boss, "The Warden", with three
 * phased mechanics taken from the brief:
 *
 *  - opening: telegraphed AoE (a circle that flashes for ~1.2s before it
 *    detonates and damages anything inside).
 *  - bullet-hell: a ring of N projectiles fired outward.
 *  - dash: a fast linear charge toward the player; activates below 50% HP.
 *
 * The actual rendering and physics live in MainScene, but the timing/phase
 * logic is testable here without booting Phaser.
 */

export interface BossDef {
  id: string;
  /** Original roster id (before scaling suffix) - used for texture lookup. */
  baseId: string;
  name: string;
  hp: number;
  damage: number;
  speed: number;
  radius: number;
  xp: number;
  coins: number;
  color: number;
  aoeTelegraphMs: number;
  aoeRadius: number;
  ringBulletCount: number;
  ringBulletSpeed: number;
  ringBulletDamage: number;
  dashSpeed: number;
  dashDurationMs: number;
}

export const BOSS_WARDEN: BossDef = {
  id: 'warden',
  baseId: 'warden',
  name: 'The Warden',
  hp: 1500,
  damage: 25,
  speed: 60,
  radius: 38,
  xp: 100,
  coins: 50,
  color: 0xff3060,
  aoeTelegraphMs: 1200,
  aoeRadius: 140,
  ringBulletCount: 16,
  ringBulletSpeed: 220,
  ringBulletDamage: 12,
  dashSpeed: 460,
  dashDurationMs: 700,
};

/** Roster of boss types - cycled through as more spawn. */
export const BOSS_ROSTER: BossDef[] = [
  BOSS_WARDEN,
  {
    ...BOSS_WARDEN,
    id: 'crimson-reaver',
    baseId: 'crimson-reaver',
    name: 'Crimson Reaver',
    color: 0xff8030,
    ringBulletCount: 20,
    ringBulletSpeed: 260,
  },
  {
    ...BOSS_WARDEN,
    id: 'void-monarch',
    baseId: 'void-monarch',
    name: 'Void Monarch',
    color: 0xa040ff,
    aoeRadius: 180,
    ringBulletCount: 24,
    dashSpeed: 540,
  },
  {
    ...BOSS_WARDEN,
    id: 'storm-titan',
    baseId: 'storm-titan',
    name: 'Storm Titan',
    color: 0x40c8ff,
    ringBulletCount: 28,
    ringBulletSpeed: 300,
    aoeRadius: 200,
  },
];

/**
 * Build a scaled boss for the given encounter number (1-indexed).
 * Each subsequent boss is significantly stronger.
 */
export function makeScaledBoss(bossNumber: number): BossDef {
  const base = BOSS_ROSTER[(bossNumber - 1) % BOSS_ROSTER.length]!;
  const scale = 1 + (bossNumber - 1) * 0.6;
  return {
    ...base,
    id: `${base.id}-${bossNumber}`,
    baseId: base.id,
    name: `${base.name} ${bossNumber > 1 ? `Mk.${bossNumber}` : ''}`.trim(),
    hp: Math.floor(base.hp * scale),
    damage: Math.floor(base.damage * (1 + (bossNumber - 1) * 0.3)),
    xp: Math.floor(base.xp * scale),
    coins: Math.floor(base.coins * scale),
    ringBulletDamage: Math.floor(base.ringBulletDamage * (1 + (bossNumber - 1) * 0.25)),
    ringBulletCount: base.ringBulletCount + (bossNumber - 1) * 2,
  };
}

export type BossPhase = 'idle' | 'aoe-telegraph' | 'aoe-detonate' | 'bullet-hell' | 'dash';

export interface BossState {
  def: BossDef;
  hp: number;
  phase: BossPhase;
  /** Remaining time in the current phase, in ms. */
  phaseTimeMs: number;
  /** Time until next attack pick, in ms. */
  attackCooldownMs: number;
}

export function makeBossState(def: BossDef = BOSS_WARDEN): BossState {
  return {
    def,
    hp: def.hp,
    phase: 'idle',
    phaseTimeMs: 0,
    attackCooldownMs: 1500,
  };
}

/**
 * Tick the boss AI by deltaMs. Returns events the scene should react to,
 * like detonating an AoE or firing a ring of bullets.
 */
export interface BossTickEvents {
  detonate: boolean;
  fireRing: boolean;
  startedDash: boolean;
}

export function tickBoss(state: BossState, deltaMs: number, rng: () => number = Math.random): BossTickEvents {
  const events: BossTickEvents = { detonate: false, fireRing: false, startedDash: false };
  const enraged = state.hp / state.def.hp < 0.5;

  state.phaseTimeMs -= deltaMs;
  state.attackCooldownMs -= deltaMs;

  switch (state.phase) {
    case 'aoe-telegraph':
      if (state.phaseTimeMs <= 0) {
        events.detonate = true;
        state.phase = 'aoe-detonate';
        state.phaseTimeMs = 200;
      }
      break;
    case 'aoe-detonate':
      if (state.phaseTimeMs <= 0) {
        state.phase = 'idle';
      }
      break;
    case 'dash':
      if (state.phaseTimeMs <= 0) {
        state.phase = 'idle';
      }
      break;
    case 'bullet-hell':
      // Ring is one-shot; fired on entry, then we wait briefly.
      if (state.phaseTimeMs <= 0) {
        state.phase = 'idle';
      }
      break;
    case 'idle':
    default:
      if (state.attackCooldownMs <= 0) {
        const r = rng();
        if (enraged && r < 0.45) {
          // Dash unlocks below 50% HP and is more likely.
          state.phase = 'dash';
          state.phaseTimeMs = state.def.dashDurationMs;
          events.startedDash = true;
          state.attackCooldownMs = 2200;
        } else if (r < 0.65) {
          state.phase = 'aoe-telegraph';
          state.phaseTimeMs = state.def.aoeTelegraphMs;
          state.attackCooldownMs = 2400;
        } else {
          state.phase = 'bullet-hell';
          state.phaseTimeMs = 600;
          events.fireRing = true;
          state.attackCooldownMs = 2600;
        }
      }
      break;
  }
  return events;
}
