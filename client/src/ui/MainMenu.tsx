import { useAppStore } from '@/state/store';
import { wallet } from '@/network/wallet';

export default function MainMenu() {
  const setScreen = useAppStore((s) => s.setScreen);
  const selected = useAppStore((s) => s.selectedCharacter);

  const onPlay = () => setScreen('playing');
  const onSelect = () => setScreen('character-select');
  const onHelp = () => setScreen('how-to-play');
  const onConnect = () => {
    void wallet.connect();
  };

  return (
    <div className="cas-overlay">
      <div className="cas-overlay-card">
        <h2>Crypto Arena Survivors</h2>
        <p style={{ color: 'var(--fg-soft)', marginTop: -8 }}>
          Phase 1 prototype. Selected: <strong>{selected}</strong>
        </p>
        <div className="cas-row" style={{ marginTop: 18, flexDirection: 'column', alignItems: 'stretch' }}>
          <button onClick={onPlay} aria-label="Play">Play</button>
          <button onClick={onSelect}>Character Select</button>
          <button onClick={onHelp}>How to Play</button>
          <button onClick={onConnect}>Connect Wallet (stub)</button>
        </div>
      </div>
    </div>
  );
}
