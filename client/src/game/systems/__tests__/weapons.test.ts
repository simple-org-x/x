import { describe, it, expect } from 'vitest';
import { WEAPONS, getWeapon } from '@/data/weapons';
import { getCharacter } from '@/data/characters';
import { makePlayerState } from '@/game/systems/Player';
import {
  effectiveCooldownMs,
  effectiveProjectileCount,
  fanAngles,
  makeWeaponRuntime,
  tickWeapons,
} from '@/game/systems/Weapons';

describe('weapons data table', () => {
  it('defines exactly 5 weapons', () => {
    expect(WEAPONS).toHaveLength(5);
  });

  it('marks pistol and shotgun as Phase 1 available', () => {
    expect(getWeapon('pistol').available).toBe(true);
    expect(getWeapon('shotgun').available).toBe(true);
  });

  it('marks the remaining 3 as not yet available', () => {
    expect(getWeapon('laser').available).toBe(false);
    expect(getWeapon('rocket').available).toBe(false);
    expect(getWeapon('katana').available).toBe(false);
  });
});

describe('cooldown and attack speed', () => {
  it('pistol cooldown shrinks with attack speed', () => {
    const player = makePlayerState(getCharacter('potato-soldier'));
    const baseline = effectiveCooldownMs(getWeapon('pistol'), player);
    player.stats.attackSpeedMul = 2;
    const faster = effectiveCooldownMs(getWeapon('pistol'), player);
    expect(faster).toBeLessThan(baseline);
    expect(faster).toBeCloseTo(baseline / 2, 5);
  });

  it('shotgun emits N pellets equal to projectileCount + bonus', () => {
    const player = makePlayerState(getCharacter('potato-soldier'));
    const shotgun = getWeapon('shotgun');
    expect(effectiveProjectileCount(shotgun, player)).toBe(shotgun.projectileCount);
    player.stats.projectileCountBonus = 2;
    expect(effectiveProjectileCount(shotgun, player)).toBe(shotgun.projectileCount + 2);
  });

  it('fanAngles spans the configured spread for a multi-pellet weapon', () => {
    const angles = fanAngles(0, 5, 28);
    expect(angles).toHaveLength(5);
    const last = angles[angles.length - 1]!;
    const first = angles[0]!;
    expect(last - first).toBeCloseTo((28 * Math.PI) / 180, 5);
  });

  it('fanAngles returns a single angle when count is 1', () => {
    expect(fanAngles(1.23, 1, 28)).toEqual([1.23]);
  });
});

describe('tickWeapons', () => {
  it('only fires weapons whose cooldown has elapsed', () => {
    const player = makePlayerState(getCharacter('potato-soldier'));
    const rt = [makeWeaponRuntime('pistol')];
    // First tick: ready to fire (cooldown starts at 0).
    const firstReady = tickWeapons(rt, 0, player);
    expect(firstReady).toHaveLength(1);
    // Right after: not ready until the cooldown drains.
    const stillCoolingDown = tickWeapons(rt, 100, player);
    expect(stillCoolingDown).toHaveLength(0);
    // Long enough wait: ready again.
    const readyAgain = tickWeapons(rt, 5000, player);
    expect(readyAgain).toHaveLength(1);
  });

  it('skips weapons not flagged as available', () => {
    const player = makePlayerState(getCharacter('potato-soldier'));
    const rt = [makeWeaponRuntime('laser')];
    const ready = tickWeapons(rt, 0, player);
    expect(ready).toHaveLength(0);
  });
});
