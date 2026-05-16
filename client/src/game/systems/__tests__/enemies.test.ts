import { describe, it, expect } from 'vitest';
import { ENEMIES, enemiesForWave, pickEnemyForWave, spawnCountForWave } from '@/game/systems/Enemies';

describe('enemies data table', () => {
  it('defines exactly 10 enemy archetypes', () => {
    expect(ENEMIES).toHaveLength(10);
  });

  it('every archetype has positive HP, damage, and speed', () => {
    for (const e of ENEMIES) {
      expect(e.hp).toBeGreaterThan(0);
      expect(e.damage).toBeGreaterThan(0);
      expect(e.speed).toBeGreaterThan(0);
      expect(e.xp).toBeGreaterThan(0);
      expect(e.radius).toBeGreaterThan(0);
    }
  });

  it('archetypes have unique ids', () => {
    const ids = new Set(ENEMIES.map((e) => e.id));
    expect(ids.size).toBe(ENEMIES.length);
  });

  it('phase 1 wave 0 has at least one spawnable archetype', () => {
    const eligible = enemiesForWave(0);
    expect(eligible.length).toBeGreaterThanOrEqual(1);
  });

  it('phase 1 early waves (0..2) unlock at least 5 archetypes', () => {
    expect(enemiesForWave(2).length).toBeGreaterThanOrEqual(5);
  });

  it('all 10 archetypes are unlocked by wave 6', () => {
    expect(enemiesForWave(6).length).toBe(ENEMIES.length);
  });

  it('pickEnemyForWave only returns eligible archetypes', () => {
    let seed = 1;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < 200; i += 1) {
      const e = pickEnemyForWave(2, rng);
      expect(e.unlockWave).toBeLessThanOrEqual(2);
    }
  });

  it('spawnCountForWave grows with the wave index but caps', () => {
    expect(spawnCountForWave(0)).toBeLessThan(spawnCountForWave(5));
    expect(spawnCountForWave(100)).toBeLessThanOrEqual(40);
  });
});
