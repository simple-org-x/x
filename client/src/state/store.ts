import { create } from 'zustand';
import type { CharacterId } from '@/data/characters';
import type { WeaponId } from '@/data/weapons';
import type { UpgradeDef } from '@/data/upgrades';

export type Screen = 'menu' | 'character-select' | 'how-to-play' | 'playing' | 'game-over' | 'victory';

export interface HudStats {
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpToNext: number;
  timeSec: number;
  kills: number;
  weapons: WeaponId[];
}

export interface RunSummary {
  timeSec: number;
  kills: number;
  level: number;
  victory: boolean;
}

export type UpgradePickResolver = (upgrade: UpgradeDef) => void;

export interface AppState {
  screen: Screen;
  selectedCharacter: CharacterId;
  coins: number;
  hud: HudStats;
  /** When non-null, the upgrade picker is open with these 3 cards. */
  pendingUpgrades: UpgradeDef[] | null;
  pendingResolver: UpgradePickResolver | null;
  lastSummary: RunSummary | null;
  bossActive: boolean;

  setScreen: (s: Screen) => void;
  setSelectedCharacter: (id: CharacterId) => void;
  setHud: (h: Partial<HudStats>) => void;
  resetHud: () => void;
  addCoins: (n: number) => void;
  setBossActive: (b: boolean) => void;
  openUpgradePicker: (upgrades: UpgradeDef[], resolver: UpgradePickResolver) => void;
  resolveUpgrade: (upgrade: UpgradeDef) => void;
  finishRun: (summary: RunSummary) => void;
}

const defaultHud: HudStats = {
  hp: 100,
  maxHp: 100,
  level: 1,
  xp: 0,
  xpToNext: 5,
  timeSec: 0,
  kills: 0,
  weapons: [],
};

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'menu',
  selectedCharacter: 'potato-soldier',
  coins: 0,
  hud: defaultHud,
  pendingUpgrades: null,
  pendingResolver: null,
  lastSummary: null,
  bossActive: false,

  setScreen: (screen) => set({ screen }),
  setSelectedCharacter: (id) => set({ selectedCharacter: id }),
  setHud: (h) => set((state) => ({ hud: { ...state.hud, ...h } })),
  resetHud: () => set({ hud: { ...defaultHud } }),
  addCoins: (n) => set((state) => ({ coins: state.coins + n })),
  setBossActive: (b) => set({ bossActive: b }),
  openUpgradePicker: (upgrades, resolver) =>
    set({ pendingUpgrades: upgrades, pendingResolver: resolver }),
  resolveUpgrade: (upgrade) => {
    const { pendingResolver } = get();
    if (pendingResolver) pendingResolver(upgrade);
    set({ pendingUpgrades: null, pendingResolver: null });
  },
  finishRun: (summary) =>
    set({
      lastSummary: summary,
      screen: summary.victory ? 'victory' : 'game-over',
      bossActive: false,
      pendingUpgrades: null,
      pendingResolver: null,
    }),
}));
