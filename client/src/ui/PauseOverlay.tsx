import { useAppStore } from '@/state/store';

export default function PauseOverlay() {
  const setScreen = useAppStore((s) => s.setScreen);

  const handleResume = () => {
    setScreen('playing');
  };

  const handleQuit = () => {
    setScreen('menu');
  };

  return (
    <div className="cas-overlay">
      <div className="cas-card" style={{ maxWidth: 400 }}>
        <h2>Paused</h2>
        <p style={{ color: 'var(--fg-soft)', marginBottom: 16 }}>
          Press ESC to resume
        </p>
        <div style={{ display: 'flex', gap: 12, flexDirection: 'column' }}>
          <button className="cas-btn cas-btn-primary" onClick={handleResume}>
            Resume
          </button>
          <button className="cas-btn" onClick={handleQuit}>
            Quit to Menu
          </button>
        </div>
      </div>
    </div>
  );
}
