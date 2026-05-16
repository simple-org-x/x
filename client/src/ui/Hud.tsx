import { useAppStore } from '@/state/store';

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function Hud() {
  const hud = useAppStore((s) => s.hud);
  const bossActive = useAppStore((s) => s.bossActive);

  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const xpPct = Math.max(0, Math.min(100, (hud.xp / hud.xpToNext) * 100));

  return (
    <div className="cas-hud" aria-hidden="false">
      <div className="cas-hud-top">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="cas-bar cas-bar-hp" aria-label="Health">
            <span style={{ width: `${hpPct}%` }} />
          </div>
          <div className="cas-bar cas-bar-xp" aria-label="Experience">
            <span style={{ width: `${xpPct}%` }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-soft)' }}>
            Lv {hud.level} &nbsp; HP {Math.ceil(hud.hp)}/{hud.maxHp}
          </div>
        </div>
        <div className="cas-hud-stats">
          <div>Time: {fmtTime(hud.timeSec)}</div>
          <div>Kills: {hud.kills}</div>
          {bossActive ? <div style={{ color: 'var(--accent-hot)' }}>BOSS ACTIVE</div> : null}
        </div>
      </div>
      <div className="cas-hud-bottom">
        <div className="cas-weapon-list">
          {hud.weapons.map((w) => (
            <span key={w} className="cas-weapon-chip">
              {w}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
