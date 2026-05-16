import { CHARACTERS } from '@/data/characters';
import { useAppStore } from '@/state/store';

export default function CharacterSelect() {
  const selected = useAppStore((s) => s.selectedCharacter);
  const setSelected = useAppStore((s) => s.setSelectedCharacter);
  const setScreen = useAppStore((s) => s.setScreen);

  return (
    <div className="cas-overlay">
      <div className="cas-overlay-card" style={{ minWidth: 'min(720px, 92vw)' }}>
        <h2>Choose a character</h2>
        <div className="cas-character-list">
          {CHARACTERS.map((c) => (
            <button
              key={c.id}
              className="cas-character-card"
              data-selected={selected === c.id}
              data-coming-soon={Boolean(c.comingSoon)}
              onClick={() => {
                if (c.comingSoon) return;
                setSelected(c.id);
              }}
            >
              <strong>
                {c.name}
                {c.comingSoon ? <span className="cas-soon-pill">Coming soon</span> : null}
              </strong>
              <p style={{ color: 'var(--fg-soft)', marginTop: 8 }}>{c.tagline}</p>
              <div style={{ fontSize: 12, color: 'var(--fg-soft)' }}>
                HP {c.stats.maxHp} &nbsp;|&nbsp; SPD {c.stats.moveSpeed} &nbsp;|&nbsp; Weapon: {c.startingWeapon}
              </div>
            </button>
          ))}
        </div>
        <div className="cas-row">
          <button onClick={() => setScreen('menu')}>Back</button>
          <button onClick={() => setScreen('playing')}>Start Run</button>
        </div>
      </div>
    </div>
  );
}
