import { describe, it, expect } from 'vitest';
import { BOSS_WARDEN, makeBossState, tickBoss } from '@/game/systems/Boss';

describe('boss definition', () => {
  it('AoE telegraph is longer than 200ms (so the player has time to react)', () => {
    expect(BOSS_WARDEN.aoeTelegraphMs).toBeGreaterThan(200);
  });

  it('has at least 5x baseline grunt HP', () => {
    expect(BOSS_WARDEN.hp).toBeGreaterThanOrEqual(5 * 18);
  });

  it('ring shoots at least 8 bullets', () => {
    expect(BOSS_WARDEN.ringBulletCount).toBeGreaterThanOrEqual(8);
  });

  it('dash speed exceeds normal speed by a wide margin', () => {
    expect(BOSS_WARDEN.dashSpeed).toBeGreaterThan(BOSS_WARDEN.speed * 4);
  });
});

describe('tickBoss state machine', () => {
  it('starts idle and transitions to a real attack after the cooldown', () => {
    const s = makeBossState();
    expect(s.phase).toBe('idle');
    // Force a deterministic rng that picks bullet-hell (r > 0.65).
    const rng = () => 0.99;
    let firedRing = false;
    for (let i = 0; i < 50; i += 1) {
      const evt = tickBoss(s, 100, rng);
      if (evt.fireRing) {
        firedRing = true;
        break;
      }
    }
    expect(firedRing).toBe(true);
  });

  it('only enters dash phase when below 50% HP', () => {
    const s = makeBossState();
    // Above 50% HP, the dash branch should never trigger no matter what rng.
    let dashedAboveHalf = false;
    for (let i = 0; i < 200; i += 1) {
      const evt = tickBoss(s, 100, () => 0.0); // strongly biased to dash branch
      if (evt.startedDash) {
        dashedAboveHalf = true;
        break;
      }
      // Reset the cooldown so a new attack pick happens next loop.
      s.phase = 'idle';
      s.attackCooldownMs = 0;
    }
    expect(dashedAboveHalf).toBe(false);

    // Drop HP below 50% and confirm dash now triggers.
    s.hp = s.def.hp * 0.4;
    s.phase = 'idle';
    s.attackCooldownMs = 0;
    const evt = tickBoss(s, 100, () => 0.0);
    expect(evt.startedDash).toBe(true);
    expect(s.phase).toBe('dash');
  });

  it('AoE telegraph detonates only after telegraph duration elapses', () => {
    const s = makeBossState();
    // Force AoE branch with deterministic rng (between 0.0 and 0.45 enraged
    // would dash, so above-half HP and r=0.5 picks aoe-telegraph).
    s.attackCooldownMs = 0;
    tickBoss(s, 0, () => 0.5);
    expect(s.phase).toBe('aoe-telegraph');
    // Half-way through telegraph, no detonate yet.
    const half = tickBoss(s, s.def.aoeTelegraphMs / 2, () => 0.5);
    expect(half.detonate).toBe(false);
    // After full telegraph, detonate fires once.
    const finish = tickBoss(s, s.def.aoeTelegraphMs, () => 0.5);
    expect(finish.detonate).toBe(true);
    expect(s.phase).toBe('aoe-detonate');
  });
});
