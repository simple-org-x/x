import { BOSS_ROSTER, makeScaledBoss, type BossDef } from '@/game/systems/Boss';
import { useAppStore } from '@/state/store';
import { useI18n } from '@/i18n';

function hexToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

interface SkillDescriptor {
  name: string;
  detail: string;
  icon: string;
}

function getSkills(def: BossDef, t: (key: string) => string): SkillDescriptor[] {
  return [
    {
      icon: '◎',
      name: t('bossBestiary.skillAoe'),
      detail: `Marks a ${def.aoeRadius}px radius zone for ${(def.aoeTelegraphMs / 1000).toFixed(1)}s, then detonates for ${def.damage} dmg.`,
    },
    {
      icon: '✦',
      name: t('bossBestiary.skillBulletRing'),
      detail: `Fires ${def.ringBulletCount} bullets outward @ ${def.ringBulletSpeed} speed, ${def.ringBulletDamage} dmg each.`,
    },
    {
      icon: '➤',
      name: t('bossBestiary.skillDash'),
      detail: `Below 50% HP, charges at player @ ${def.dashSpeed} speed for ${(def.dashDurationMs / 1000).toFixed(1)}s.`,
    },
  ];
}

export default function BossBestiary() {
  const setScreen = useAppStore((s) => s.setScreen);
  const { t } = useI18n();

  // Show scaling preview at bosses #1, #2, #3 to illustrate progression
  const sampleScales = [1, 2, 3, 5, 10];

  return (
    <div className="cas-overlay">
      <div
        className="cas-overlay-card"
        style={{ maxWidth: 880, maxHeight: '88vh', overflow: 'auto', textAlign: 'left' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
          }}
        >
          <h2 style={{ margin: 0 }}>{t('bossBestiary.title')}</h2>
          <button onClick={() => setScreen('menu')}>← {t('bossBestiary.back')}</button>
        </div>
        <p style={{ color: 'var(--fg-soft)', fontSize: 13, marginBottom: 18 }}>
          Bosses spawn every <strong>10 player levels</strong> (Lv 10, 20, 30…). The roster cycles
          through these four archetypes; each subsequent encounter is significantly stronger.
        </p>

        <div style={{ display: 'grid', gap: 14 }}>
          {BOSS_ROSTER.map((def) => {
            const cssColor = hexToCss(def.color);
            const skills = getSkills(def, t);
            return (
              <div
                key={def.id}
                style={{
                  background: 'rgba(14, 19, 28, 0.85)',
                  border: `2px solid ${cssColor}`,
                  borderRadius: 12,
                  padding: 14,
                  boxShadow: `0 0 24px -10px ${cssColor}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: cssColor,
                      flex: '0 0 auto',
                      boxShadow: `0 0 8px ${cssColor}`,
                    }}
                  />
                  <h3 style={{ margin: 0, color: cssColor }}>{def.name}</h3>
                  <span style={{ color: 'var(--fg-soft)', fontSize: 12 }}>
                    {def.id}
                  </span>
                </div>

                {/* Stats row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: 8,
                    marginBottom: 10,
                    fontSize: 12,
                  }}
                >
                  <Stat label={t('bossBestiary.baseHp')} value={def.hp.toLocaleString()} hot />
                  <Stat label={t('bossBestiary.contactDmg')} value={def.damage} />
                  <Stat label={t('bossBestiary.speed')} value={def.speed} />
                  <Stat label={t('bossBestiary.xpDrop')} value={def.xp} />
                  <Stat label={t('bossBestiary.coinDrop')} value={def.coins} />
                </div>

                {/* Skills */}
                <div style={{ fontSize: 12, color: 'var(--fg-soft)', marginBottom: 4 }}>
                  Skills:
                </div>
                <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
                  {skills.map((s) => (
                    <div
                      key={s.name}
                      style={{
                        display: 'flex',
                        gap: 8,
                        padding: '6px 10px',
                        background: 'rgba(0,0,0,0.25)',
                        borderRadius: 6,
                        borderLeft: `3px solid ${cssColor}`,
                        fontSize: 12,
                        lineHeight: 1.4,
                      }}
                    >
                      <span style={{ color: cssColor, fontWeight: 'bold', minWidth: 16 }}>
                        {s.icon}
                      </span>
                      <span>
                        <strong style={{ color: 'var(--fg)' }}>{s.name}</strong>
                        <span style={{ color: 'var(--fg-soft)' }}> — {s.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>

                {/* Scaling preview */}
                <details>
                  <summary
                    style={{ cursor: 'pointer', fontSize: 11, color: 'var(--fg-soft)' }}
                  >
                    HP scaling preview (when this boss type appears)
                  </summary>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginTop: 8,
                      fontSize: 11,
                    }}
                  >
                    {sampleScales.map((n) => {
                      // Find first encounter number where THIS boss type appears in cycle
                      const rosterIdx = BOSS_ROSTER.indexOf(def);
                      const encounterNumber = rosterIdx + 1 + (n - 1) * BOSS_ROSTER.length;
                      const scaled = makeScaledBoss(encounterNumber);
                      return (
                        <div
                          key={n}
                          style={{
                            padding: '4px 8px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid #2a3142',
                            borderRadius: 4,
                            color: 'var(--fg-soft)',
                          }}
                        >
                          <span style={{ color: cssColor }}>#{encounterNumber}</span>{' '}
                          HP:{' '}
                          <strong style={{ color: 'var(--accent-hot)' }}>
                            {scaled.hp.toLocaleString()}
                          </strong>
                          {' • '}
                          Dmg:{' '}
                          <strong>{scaled.damage}</strong>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 18,
            padding: 12,
            background: 'rgba(92, 247, 196, 0.06)',
            border: '1px solid var(--accent)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--fg-soft)',
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: 'var(--accent)' }}>{t('bossBestiary.scalingFormula')}</strong>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hot }: { label: string; value: string | number; hot?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(0,0,0,0.25)',
        padding: '4px 8px',
        borderRadius: 4,
      }}
    >
      <span style={{ color: 'var(--fg-soft)', fontSize: 10, textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ color: hot ? 'var(--accent-hot)' : 'var(--fg)', fontWeight: 'bold' }}>
        {value}
      </span>
    </div>
  );
}
