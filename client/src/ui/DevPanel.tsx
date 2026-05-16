import { useEffect, useState } from 'react';
import { useAppStore } from '@/state/store';

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
}

function getHooks(): DevHooks | null {
  const w = window as unknown as { __cas_dev?: DevHooks };
  return w.__cas_dev ?? null;
}

export default function DevPanel() {
  const screen = useAppStore((s) => s.screen);
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
        <span>🛠 TESTER PANEL</span>
        <button className="cas-dev-close" onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
      </div>
      <div className="cas-dev-hint">Press <kbd>`</kbd> to toggle</div>

      <div className="cas-dev-section">
        <div className="cas-dev-section-title">XP / Level</div>
        <div className="cas-dev-row">
          <button onClick={() => callHook('gainXp', 50)}>+50 XP</button>
          <button onClick={() => callHook('gainXp', 200)}>+200 XP</button>
          <button onClick={() => callHook('forceLevelUp')}>Level Up!</button>
        </div>
        <div className="cas-dev-row">
          <button onClick={() => callHook('jumpToLevel', 5)}>Jump → Lv 5</button>
          <button onClick={() => callHook('jumpToLevel', 10)}>Jump → Lv 10</button>
          <button onClick={() => callHook('jumpToLevel', 20)}>Jump → Lv 20</button>
        </div>
      </div>

      <div className="cas-dev-section">
        <div className="cas-dev-section-title">Boss</div>
        <div className="cas-dev-row">
          <button onClick={() => callHook('spawnBossNow')} className="cas-dev-btn-hot">
            ⚡ Spawn Boss Now
          </button>
          <button onClick={() => callHook('killBoss')} className="cas-dev-btn-gold">
            💀 Kill Boss
          </button>
        </div>
        <div className="cas-dev-mini-hint">
          Spawn → see entrance animation, HP bar, name.<br />
          Kill → see celebration + particles.
        </div>
      </div>

      <div className="cas-dev-section">
        <div className="cas-dev-section-title">Player</div>
        <div className="cas-dev-row">
          <button onClick={() => callHook('healFull')}>Heal Full</button>
          <button
            onClick={() => {
              const next = callHook('toggleGodMode') as boolean;
              setGod(next);
            }}
            className={god ? 'cas-dev-btn-active' : ''}
          >
            God Mode: {god ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <div className="cas-dev-section">
        <div className="cas-dev-section-title">Game Speed ({speed.toFixed(2)}×)</div>
        <div className="cas-dev-row">
          <button onClick={() => { callHook('setSpeed', 0.5); setSpeedState(0.5); }}>0.5×</button>
          <button onClick={() => { callHook('setSpeed', 1); setSpeedState(1); }}>1×</button>
          <button onClick={() => { callHook('setSpeed', 2); setSpeedState(2); }}>2×</button>
          <button onClick={() => { callHook('setSpeed', 4); setSpeedState(4); }}>4×</button>
        </div>
      </div>
    </div>
  );
}
