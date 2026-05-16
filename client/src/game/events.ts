import type { UpgradeDef } from '@/data/upgrades';
import type { RunSummary, HudStats, ActiveSkill, LegendarySkillInstance } from '@/state/store';

export interface HudPayload extends Partial<HudStats> {
  weapons?: string[];
}

export interface GameEvents {
  hudUpdate: (h: HudPayload) => void;
  bossSpawn: (bossNumber: number, bossName: string) => void;
  bossDefeated: (bossNumber: number) => void;
  levelUp: (
    cards: UpgradeDef[],
    resolve: (chosen: UpgradeDef) => void,
    challenge?: ActiveSkill,
  ) => void;
  skillGained: (skill: ActiveSkill) => void;
  legendaryGained: (skill: LegendarySkillInstance) => void;
  gameOver: (summary: RunSummary & { bossKills: number }) => void;
  victory: (summary: RunSummary & { bossKills: number }) => void;
}
