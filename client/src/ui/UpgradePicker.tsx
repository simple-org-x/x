import { useEffect } from 'react';
import { useAppStore } from '@/state/store';
import type { UpgradeDef } from '@/data/upgrades';

export default function UpgradePicker() {
  const pending = useAppStore((s) => s.pendingUpgrades);
  const resolve = useAppStore((s) => s.resolveUpgrade);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      const idx = ['1', '2', '3'].indexOf(e.key);
      if (idx >= 0 && pending[idx]) {
        resolve(pending[idx] as UpgradeDef);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, resolve]);

  if (!pending) return null;
  return (
    <div className="cas-overlay" role="dialog" aria-label="Choose an upgrade">
      <div className="cas-overlay-card" style={{ minWidth: 'min(720px, 92vw)' }}>
        <h2>Level up!</h2>
        <p style={{ color: 'var(--fg-soft)', marginTop: -8 }}>
          Pick an upgrade. Press <kbd>1</kbd>, <kbd>2</kbd>, or <kbd>3</kbd>.
        </p>
        <div className="cas-upgrade-grid">
          {pending.map((u, i) => (
            <button
              key={u.id}
              className="cas-upgrade-card"
              data-tier={u.tier}
              onClick={() => resolve(u)}
              aria-label={`Upgrade ${i + 1}: ${u.name}`}
            >
              <span className="cas-tier-badge">
                {u.tier} &middot; {i + 1}
              </span>
              <strong>{u.name}</strong>
              <span style={{ color: 'var(--fg-soft)' }}>{u.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
