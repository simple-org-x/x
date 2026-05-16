import { create } from 'zustand';
import type { CharacterId } from '@/data/characters';
import type { WeaponId } from '@/data/weapons';
import type { UpgradeDef } from '@/data/upgrades';

export type Screen =
  | 'menu'
  | 'character-select'
  | 'how-to-play'
  | 'username'
  | 'leaderboard'
  | 'skill-list'
  | 'boss-bestiary'
  | 'playing'
  | 'paused'
  | 'game-over'
  | 'victory';

export type LegendarySkillId = 'freeze-blast' | 'purge-bolt';

export interface LegendarySkillInstance {
  id: LegendarySkillId;
  name: string;
  description: string;
  /** Hex color for sidebar badge. */
  color: number;
  /** Charges remaining (1 = single use). */
  charges: number;
}

export interface ActiveSkill {
  id: string;
  name: string;
  description: string;
  tier: 'common' | 'rare' | 'epic' | 'legendary';
  count: number;
}

export interface GameRecord {
  username: string;
  character: string;
  timeSec: number;
  kills: number;
  bossKills: number;
  level: number;
  victory: boolean;
  /** ISO timestamp. */
  at: string;
}

export interface HudStats {
  hp: number;
  maxHp: number;
  xp: number;
  xpForNext: number;
  level: number;
  kills: number;
  bossKills: number;
  timeSec: number;
}

export interface HudPayload extends HudStats {
  weapons: string[];
}

export interface RunSummary {
  timeSec: number;
  kills: number;
  bossKills: number;
  level: number;
  victory: boolean;
}

export type UpgradePickResolver = (upgrade: UpgradeDef) => void;

export interface AppState {
  screen: Screen;
  selectedCharacter: CharacterId;
  coins: number;
  username: string;
  hud: HudStats;
  activeSkills: ActiveSkill[];
  legendarySkills: LegendarySkillInstance[];
  gameRecords: GameRecord[];
  /** When non-null, the upgrade picker is open with these 3 cards. */
  pendingUpgrades: UpgradeDef[] | null;
  pendingResolver: UpgradePickResolver | null;
  lastSummary: RunSummary | null;
  bossActive: boolean;
  /** ID of legendary skill the player wants to activate this frame. MainScene clears it. */
  pendingLegendaryActivation: LegendarySkillId | null;

  setScreen: (s: Screen) => void;
  setSelectedCharacter: (id: CharacterId) => void;
  setUsername: (name: string) => void;
  setHud: (h: Partial<HudStats>) => void;
  resetHud: () => void;
  addCoins: (n: number) => void;
  setBossActive: (b: boolean) => void;
  addActiveSkill: (skill: ActiveSkill) => void;
  addLegendarySkill: (skill: LegendarySkillInstance) => void;
  useLegendarySkill: (id: LegendarySkillId) => void;
  resetSkills: () => void;
  clearLegendaryActivation: () => void;
  saveGameRecord: (record: GameRecord) => void;
  openUpgradePicker: (upgrades: UpgradeDef[], resolver: UpgradePickResolver) => void;
  resolveUpgrade: (upgrade: UpgradeDef) => void;
  finishRun: (summary: RunSummary) => void;
}

const defaultHud: HudStats = {
  hp: 100,
  maxHp: 100,
  level: 1,
  xp: 0,
  xpForNext: 10,
  timeSec: 0,
  kills: 0,
  bossKills: 0,
};

const USERNAME_KEY = 'cas:username';
const RECORDS_KEY = 'cas:gameRecords';
const MAX_RECORDS = 50;

function loadUsername(): string {
  try {
    return localStorage.getItem(USERNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function loadRecords(): GameRecord[] {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GameRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistRecords(records: GameRecord[]): void {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // localStorage unavailable - non-fatal
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'menu',
  selectedCharacter: 'potato-soldier',
  coins: 0,
  username: loadUsername(),
  hud: defaultHud,
  activeSkills: [],
  legendarySkills: [],
  gameRecords: loadRecords(),
  pendingUpgrades: null,
  pendingResolver: null,
  lastSummary: null,
  bossActive: false,
  pendingLegendaryActivation: null,

  setScreen: (screen) => set({ screen }),
  setSelectedCharacter: (id) => set({ selectedCharacter: id }),
  setUsername: (name) => {
    const trimmed = name.trim().slice(0, 20);
    try {
      localStorage.setItem(USERNAME_KEY, trimmed);
    } catch {
      // ignore
    }
    set({ username: trimmed });
  },
  setHud: (h) => set((state) => ({ hud: { ...state.hud, ...h } })),
  resetHud: () => set({ hud: { ...defaultHud } }),
  addCoins: (n) => set((state) => ({ coins: state.coins + n })),
  setBossActive: (b) => set({ bossActive: b }),
  addActiveSkill: (skill) =>
    set((state) => {
      const existing = state.activeSkills.find((s) => s.id === skill.id);
      if (existing) {
        return {
          activeSkills: state.activeSkills.map((s) =>
            s.id === skill.id ? { ...s, count: s.count + 1 } : s,
          ),
        };
      }
      return { activeSkills: [...state.activeSkills, skill] };
    }),
  addLegendarySkill: (skill) =>
    set((state) => {
      const existing = state.legendarySkills.find((s) => s.id === skill.id);
      if (existing) {
        return {
          legendarySkills: state.legendarySkills.map((s) =>
            s.id === skill.id ? { ...s, charges: s.charges + skill.charges } : s,
          ),
        };
      }
      return { legendarySkills: [...state.legendarySkills, skill] };
    }),
  useLegendarySkill: (id) =>
    set((state) => {
      const target = state.legendarySkills.find((s) => s.id === id);
      if (!target || target.charges <= 0) return {};
      return {
        legendarySkills: state.legendarySkills
          .map((s) => (s.id === id ? { ...s, charges: s.charges - 1 } : s))
          .filter((s) => s.charges > 0),
        pendingLegendaryActivation: id,
      };
    }),
  resetSkills: () =>
    set({ activeSkills: [], legendarySkills: [], pendingLegendaryActivation: null }),
  clearLegendaryActivation: () => set({ pendingLegendaryActivation: null }),
  saveGameRecord: (record) =>
    set((state) => {
      const next = [...state.gameRecords, record]
        .sort((a, b) => {
          // Sort by score: bossKills desc, level desc, timeSec desc
          if (b.bossKills !== a.bossKills) return b.bossKills - a.bossKills;
          if (b.level !== a.level) return b.level - a.level;
          return b.timeSec - a.timeSec;
        })
        .slice(0, MAX_RECORDS);
      persistRecords(next);
      return { gameRecords: next };
    }),
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
