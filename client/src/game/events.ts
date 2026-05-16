import type { UpgradeDef } from '@/data/upgrades';
import type { RunSummary, HudStats } from '@/state/store';

export interface GameEvents {
  hudUpdate: (h: Partial<HudStats>) => void;
  bossSpawn: () => void;
  levelUp: (cards: UpgradeDef[], resolve: (chosen: UpgradeDef) => void) => void;
  gameOver: (summary: RunSummary) => void;
  victory: (summary: RunSummary) => void;
}
