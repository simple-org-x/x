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
  name: string;
  hp: number;
  damage: number;
  speed: number;
  radius: number;
  /** XP dropped on death. */
  xp: number;
  /** Hex color for the procedural sprite. */
  color: number;
  /** Telegraph duration before the AoE detonates, in ms. */
  aoeTelegraphMs: number;
  /** AoE explosion radius. */
  aoeRadius: number;
  /** Number of bullets in the bullet-hell ring. */
  ringBulletCount: number;
  /** Bullet speed in px/sec. */
  ringBulletSpeed: number;
  /** Damage per ring bullet. */
  ringBulletDamage: number;
  /** Dash speed in px/sec. */
  dashSpeed: number;
  /** Dash duration in ms. */
  dashDurationMs: number;
}

export const BOSS_WARDEN: BossDef = {
  id: 'warden',
  name: 'The Warden',
  hp: 1500,
  damage: 25,
  speed: 60,
  radius: 38,
  xp: 100,
  color: 0xff3060,
  aoeTelegraphMs: 1200,
  aoeRadius: 140,
  ringBulletCount: 16,
  ringBulletSpeed: 220,
  ringBulletDamage: 12,
  dashSpeed: 460,
  dashDurationMs: 700,
};

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
