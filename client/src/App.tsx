import { lazy, Suspense } from 'react';
import { useAppStore } from '@/state/store';
import MainMenu from '@/ui/MainMenu';
import CharacterSelect from '@/ui/CharacterSelect';
import HowToPlay from '@/ui/HowToPlay';
import GameOver from '@/ui/GameOver';
import Hud from '@/ui/Hud';
import UpgradePicker from '@/ui/UpgradePicker';
import { wallet } from '@/network/wallet';

// Lazy-load the Phaser host so jsdom-based tests can render <App /> without
// pulling in the canvas-heavy game module.
const PhaserGame = lazy(() => import('@/game/PhaserGame'));

export default function App() {
  const screen = useAppStore((s) => s.screen);
  const coins = useAppStore((s) => s.coins);
  const session = wallet.getSession();

  const isPlaying = screen === 'playing';

  return (
    <div className="cas-app">
      <header className="cas-topbar">
        <h1>Crypto Arena Survivors</h1>
        <div className="cas-topbar-right">
          <span className="cas-coins" aria-label="Soft currency">
            {coins} coins
          </span>
          <span style={{ color: 'var(--fg-soft)', fontSize: 12 }}>{session.display}</span>
        </div>
      </header>
      <main className="cas-stage">
        {isPlaying ? (
          <Suspense fallback={<div style={{ color: 'var(--fg-soft)', padding: 24 }}>Loading...</div>}>
            <PhaserGame />
          </Suspense>
        ) : null}
        {isPlaying ? <Hud /> : null}
        <UpgradePicker />
        {screen === 'menu' ? <MainMenu /> : null}
        {screen === 'character-select' ? <CharacterSelect /> : null}
        {screen === 'how-to-play' ? <HowToPlay /> : null}
        {screen === 'game-over' ? <GameOver victory={false} /> : null}
        {screen === 'victory' ? <GameOver victory={true} /> : null}
      </main>
    </div>
  );
}
