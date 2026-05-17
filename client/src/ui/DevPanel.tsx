import { useEffect, useState } from 'react';
import { useAppStore } from '@/state/store';
import { useI18n } from '@/i18n';

interface DevHooks {
  gainXp: (amount: number) => void;
  forceLevelUp: () => void;
  spawnBossNow: () => void;
  killBoss: () => void;
  toggleGodMode: () => boolean;
  isGodMode: () => boolean;
  setSpeed: (mul: number) => void;
  getSpeed: () => number;
  healFull: () => void;
  jumpToLevel: (target: number) => void;
  grantFreezeBlast: () => void;
  grantPurgeBolt: () => void;
}

function getHooks(): DevHooks | null {
  const w = window as unknown as { __cas_dev?: DevHooks };
  return w.__cas_dev ?? null;
}

export default function DevPanel() {
  const screen = useAppStore((s) => s.screen);
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const [god, setGod] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [, forceTick] = useState(0);

  // Toggle with backtick (`) key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === '~') {
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Periodically refresh state from hooks (god/speed reflect engine truth)
  useEffect(() => {
    const id = setInterval(() => {
      const h = getHooks();
      if (h) {
        setGod(h.isGodMode());
        setSpeedState(h.getSpeed());
      }
      forceTick((n) => n + 1);
    }, 250);
    return () => clearInterval(id);
  }, []);

  if (screen !== 'playing' && screen !== 'paused') return null;
  if (!open) {
    return (
      <button
        className="cas-dev-fab"
        onClick={() => setOpen(true)}
        title="Open tester panel (press ` to toggle)"
      >
        🛠
      </button>
    );
  }

  const callHook = <K extends keyof DevHooks>(name: K, ...args: Parameters<DevHooks[K]>) => {
    const h = getHooks();
    if (!h) {
      console.warn('[DevPanel] hooks unavailable - is the game scene running?');
      return undefined;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (h[name] as any)(...args);
  };

  return (
    <div className="cas-dev-panel" role="region" aria-label="Tester panel">
      <div className="cas-dev-header">
        <span>🛠 {t('devPanel.title')}</span>
        <button className="cas-dev-close" onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
      </div>
      <div className="cas-dev-hint">{t('devPanel.toggleHint')} <kbd>`</kbd> {t('devPanel.toggleKey')}</div>

      <div className="cas-dev-section">
        <div className="cas-dev-section-title">{t('devPanel.xpLevel')}</div>
        <div className="cas-dev-row">
          <button onClick={() => callHook('gainXp', 50)}>{t('devPanel.gainXp50')}</button>
          <button onClick={() => callHook('gainXp', 200)}>{t('devPanel.gainXp200')}</button>
          <button onClick={() => callHook('forceLevelUp')}>{t('devPanel.levelUp')}</button>
        </div>
        <div className="cas-dev-row">
          <button onClick={() => callHook('jumpToLevel', 5)}>{t('devPanel.jumpToLv5')}</button>
          <button onClick={() => callHook('jumpToLevel', 10)}>{t('devPanel.jumpToLv10')}</button>
          <button onClick={() => callHook('jumpToLevel', 20)}>{t('devPanel.jumpToLv20')}</button>
        </div>
      </div>

      <div className="cas-dev-section">
        <div className="cas-dev-section-title">{t('devPanel.boss')}</div>
        <div className="cas-dev-row">
          <button onClick={() => callHook('spawnBossNow')} className="cas-dev-btn-hot">
            ⚡ {t('devPanel.spawnNow')}
          </button>
          <button onClick={() => callHook('killBoss')} className="cas-dev-btn-gold">
            💀 {t('devPanel.killBoss')}
          </button>
        </div>
        <div className="cas-dev-mini-hint">
          {t('devPanel.spawnHint')}<br />
          {t('devPanel.killHint')}
        </div>
      </div>

      <div className="cas-dev-section">
        <div className="cas-dev-section-title">{t('devPanel.player')}</div>
        <div className="cas-dev-row">
          <button onClick={() => callHook('healFull')}>{t('devPanel.healFull')}</button>
          <button
            onClick={() => {
              const next = callHook('toggleGodMode') as boolean;
              setGod(next);
            }}
            className={god ? 'cas-dev-btn-active' : ''}
          >
            {t('devPanel.godMode')}: {god ? t('devPanel.godModeOn') : t('devPanel.godModeOff')}
          </button>
        </div>
      </div>

      <div className="cas-dev-section">
        <div className="cas-dev-section-title">{t('devPanel.speed')} ({speed.toFixed(2)}×)</div>
        <div className="cas-dev-row">
          <button onClick={() => { callHook('setSpeed', 0.5); setSpeedState(0.5); }}>{t('devPanel.speed05x')}</button>
          <button onClick={() => { callHook('setSpeed', 1); setSpeedState(1); }}>{t('devPanel.speed1x')}</button>
          <button onClick={() => { callHook('setSpeed', 2); setSpeedState(2); }}>{t('devPanel.speed2x')}</button>
          <button onClick={() => { callHook('setSpeed', 4); setSpeedState(4); }}>{t('devPanel.speed4x')}</button>
        </div>
      </div>

      <div className="cas-dev-section">
        <div className="cas-dev-section-title">{t('devPanel.legendarySkills')}</div>
        <div className="cas-dev-row">
          <button
            onClick={() => callHook('grantFreezeBlast')}
            style={{ background: 'rgba(102,221,255,0.2)', border: '1px solid rgba(102,221,255,0.5)', color: '#66ddff' }}
          >
            ❄️ {t('devPanel.grantFreezeBlast')}
          </button>
          <button
            onClick={() => callHook('grantPurgeBolt')}
            style={{ background: 'rgba(255,210,74,0.2)', border: '1px solid rgba(255,210,74,0.5)', color: '#ffd24a' }}
          >
            ⚡ {t('devPanel.grantPurgeBolt')}
          </button>
        </div>
        <div className="cas-dev-mini-hint">
          {t('devPanel.legendaryHint')}
        </div>
      </div>
    </div>
  );
}
