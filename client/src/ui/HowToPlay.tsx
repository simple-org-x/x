import { useAppStore } from '@/state/store';

export default function HowToPlay() {
  const setScreen = useAppStore((s) => s.setScreen);
  return (
    <div className="cas-overlay">
      <div className="cas-overlay-card" style={{ minWidth: 'min(560px, 92vw)' }}>
        <h2>How to play</h2>
        <div className="cas-help">
          <p>
            Move with <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or the arrow keys. On a
            touch screen, drag from the bottom-left to use the virtual joystick.
          </p>
          <p>
            Weapons fire on their own timers. Pick the nearest enemy and let your damage do the
            work. Hoover up the green XP gems they drop; when you level up, choose one of three
            upgrades.
          </p>
          <p>
            Survive 15 minutes to win. A boss arrives at the 3-minute mark. Watch out for the
            telegraphed AoE circle, the bullet-hell ring, and the dash below 50% HP.
          </p>
        </div>
        <div className="cas-row" style={{ marginTop: 18 }}>
          <button onClick={() => setScreen('menu')}>Back</button>
        </div>
      </div>
    </div>
  );
}
