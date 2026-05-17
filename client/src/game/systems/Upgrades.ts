import {
  UPGRADES,
  TIER_BASE_WEIGHT,
  type UpgradeDef,
  type UpgradeTier,
  type StatEffect,
  type BuildEffect,
  type LegendaryEffect,
} from '@/data/upgrades';
import type { PlayerState } from './Player';
import type { CharacterStats } from '@/data/characters';
import { useAppStore } from '@/state/store';

/**
 * Draw `count` distinct upgrades using tier-weighted random selection.
 * Luck biases the draw upward (more rares/epics/legendaries).
 */
export function drawUpgrades(
  count: number,
  luck: number,
  rng: () => number = Math.random,
  pool: readonly UpgradeDef[] = UPGRADES,
): UpgradeDef[] {
  if (count <= 0) return [];
  if (count >= pool.length) return [...pool];

  const remaining = [...pool];
  const picks: UpgradeDef[] = [];
  while (picks.length < count && remaining.length > 0) {
    const totalWeight = remaining.reduce((sum, u) => sum + tierAdjustedWeight(u, luck), 0);
    let roll = rng() * totalWeight;
    let chosenIdx = 0;
    for (let i = 0; i < remaining.length; i += 1) {
      roll -= tierAdjustedWeight(remaining[i]!, luck);
      if (roll <= 0) {
        chosenIdx = i;
        break;
      }
    }
    picks.push(remaining[chosenIdx]!);
    remaining.splice(chosenIdx, 1);
  }
  return picks;
}

function tierAdjustedWeight(u: UpgradeDef, luck: number): number {
  const base = u.weight * TIER_BASE_WEIGHT[u.tier];
  // Luck bumps higher tiers proportionally.
  const luckBonus: Record<UpgradeTier, number> = {
    common: 1.0,
    rare: 1.0 + luck * 0.6,
    epic: 1.0 + luck * 1.2,
    legendary: 1.0 + luck * 2.0,
  };
  return base * luckBonus[u.tier];
}

/**
 * Apply an upgrade's effect to a player. Stat effects use the declarative
 * descriptor; build effects flip a flag in `player.builds`.
 */
export function applyUpgrade(player: PlayerState, upgrade: UpgradeDef): void {
  if (upgrade.effect.kind === 'stat') {
    applyStatEffect(player.stats, upgrade.effect);
    if (upgrade.effect.stat === 'maxHp') {
      // Heal to full when max HP is gained, matches genre convention.
      player.hp = player.stats.maxHp;
    }
  } else if (upgrade.effect.kind === 'build') {
    applyBuildEffect(player, upgrade.effect);
  } else {
    applyLegendaryEffect(upgrade.effect);
  }
}

function applyStatEffect(stats: CharacterStats, effect: StatEffect): void {
  const current = stats[effect.stat];
  const next = effect.op === 'add' ? current + effect.value : current * effect.value;
  stats[effect.stat] = next;
}

function applyBuildEffect(player: PlayerState, effect: BuildEffect): void {
  player.builds.add(effect.build);
}

function applyLegendaryEffect(effect: LegendaryEffect): void {
  const store = useAppStore.getState();
  if (effect.skillId === 'freeze-blast') {
    store.addLegendarySkill({
      id: 'freeze-blast',
      name: 'Freeze Blast',
      description: 'Freeze non-boss enemies for 3-5 seconds.',
      color: 0x66ddff,
      charges: 1,
    });
  } else if (effect.skillId === 'purge-bolt') {
    store.addLegendarySkill({
      id: 'purge-bolt',
      name: 'Purge Bolt',
      description: 'Kill all non-boss enemies on screen.',
      color: 0xffd24a,
      charges: 1,
    });
  }
}
