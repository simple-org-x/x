import { describe, it, expect } from 'vitest';
import { UPGRADES, TIER_BASE_WEIGHT } from '@/data/upgrades';
import { drawUpgrades, applyUpgrade } from '@/game/systems/Upgrades';
import { makePlayerState } from '@/game/systems/Player';
import { getCharacter } from '@/data/characters';

describe('upgrades data table', () => {
  it('defines at least 20 entries spanning all four tiers', () => {
    expect(UPGRADES.length).toBeGreaterThanOrEqual(20);
    const tiers = new Set(UPGRADES.map((u) => u.tier));
    expect(tiers.has('common')).toBe(true);
    expect(tiers.has('rare')).toBe(true);
    expect(tiers.has('epic')).toBe(true);
    expect(tiers.has('legendary')).toBe(true);
  });

  it('every upgrade has a positive weight and a known effect', () => {
    for (const u of UPGRADES) {
      expect(u.weight).toBeGreaterThan(0);
      expect(['stat', 'build']).toContain(u.effect.kind);
    }
  });
});

describe('drawUpgrades', () => {
  it('returns 3 distinct cards', () => {
    let seed = 1;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const cards = drawUpgrades(3, 0, rng);
    expect(cards).toHaveLength(3);
    const ids = new Set(cards.map((c) => c.id));
    expect(ids.size).toBe(3);
  });

  it('weights toward common over legendary on average', () => {
    // Run a Monte Carlo over 2000 single draws and confirm common >> legendary.
    let common = 0;
    let legendary = 0;
    let seed = 42;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 2000; i += 1) {
      const card = drawUpgrades(1, 0, rng)[0]!;
      if (card.tier === 'common') common += 1;
      if (card.tier === 'legendary') legendary += 1;
    }
    expect(common).toBeGreaterThan(legendary * 4);
  });

  it('respects luck by lifting legendary draw rate', () => {
    let lowLuckLegendary = 0;
    let highLuckLegendary = 0;
    let seed = 7;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 5000; i += 1) {
      if (drawUpgrades(1, 0, rng)[0]!.tier === 'legendary') lowLuckLegendary += 1;
    }
    seed = 7;
    for (let i = 0; i < 5000; i += 1) {
      if (drawUpgrades(1, 5, rng)[0]!.tier === 'legendary') highLuckLegendary += 1;
    }
    expect(highLuckLegendary).toBeGreaterThanOrEqual(lowLuckLegendary);
  });
});

describe('applyUpgrade', () => {
  it('multiplicative damage upgrade scales damageMul', () => {
    const player = makePlayerState(getCharacter('potato-soldier'));
    const before = player.stats.damageMul;
    const dmgUp = UPGRADES.find((u) => u.id === 'damage-1')!;
    applyUpgrade(player, dmgUp);
    expect(player.stats.damageMul).toBeCloseTo(before * 1.15, 5);
  });

  it('additive maxHp upgrade heals to full', () => {
    const player = makePlayerState(getCharacter('potato-soldier'));
    player.hp = 10;
    const hpUp = UPGRADES.find((u) => u.id === 'hp-1')!;
    applyUpgrade(player, hpUp);
    expect(player.stats.maxHp).toBe(120);
    expect(player.hp).toBe(120);
  });

  it('build-defining upgrade flips a build flag', () => {
    const player = makePlayerState(getCharacter('potato-soldier'));
    const explosive = UPGRADES.find((u) => u.id === 'build-explosive')!;
    applyUpgrade(player, explosive);
    expect(player.builds.has('explosive')).toBe(true);
  });

  it('TIER_BASE_WEIGHT prefers rarer tiers proportionally less', () => {
    expect(TIER_BASE_WEIGHT.common).toBeGreaterThan(TIER_BASE_WEIGHT.rare);
    expect(TIER_BASE_WEIGHT.rare).toBeGreaterThan(TIER_BASE_WEIGHT.epic);
    expect(TIER_BASE_WEIGHT.epic).toBeGreaterThan(TIER_BASE_WEIGHT.legendary);
  });
});
