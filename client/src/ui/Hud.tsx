import { useAppStore } from '@/state/store';
import { useI18n } from '@/i18n';

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function Hud() {
  const hud = useAppStore((s) => s.hud);
  const bossActive = useAppStore((s) => s.bossActive);
  const activeSkills = useAppStore((s) => s.activeSkills);
  const legendarySkills = useAppStore((s) => s.legendarySkills);
  const useLegendary = useAppStore((s) => s.useLegendarySkill);
  const { t } = useI18n();

  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const xpPct = Math.max(0, Math.min(100, (hud.xp / hud.xpForNext) * 100));

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
          {hud.bossKills > 0 ? <div>Bosses: {hud.bossKills}</div> : null}
          {bossActive ? <div style={{ color: 'var(--accent-hot)' }}>{t('hud.bossActive')}</div> : null}
        </div>
      </div>
      <div className="cas-hud-bottom">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div className="cas-skills-sidebar">
            {activeSkills.length > 0 ? (
              <div style={{ fontSize: 11, color: 'var(--fg-soft)', marginBottom: 4 }}>{t('hud.activeSkills')}</div>
            ) : null}
            {activeSkills.map((s) => (
              <div key={s.id} className="cas-skill-chip" data-tier={s.tier}>
                {s.name} {s.count > 1 ? `×${s.count}` : ''}
              </div>
            ))}
          </div>
          {legendarySkills.length > 0 ? (
            <div className="cas-legendary-skills">
              <div style={{ fontSize: 11, color: 'var(--fg-soft)', marginBottom: 4 }}>{t('hud.legendarySkills')}</div>
              {legendarySkills.map((ls) => (
                <button
                  key={ls.id}
                  className="cas-legendary-btn"
                  style={{ borderColor: `#${ls.color.toString(16).padStart(6, '0')}` }}
                  onClick={() => useLegendary(ls.id)}
                  title={ls.description}
                >
                  {ls.name} ({ls.charges})
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
