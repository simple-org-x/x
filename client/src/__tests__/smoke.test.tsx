import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { useAppStore } from '@/state/store';

// The Phaser host is rendered lazily and only when screen === 'playing', so
// unmounting it during the smoke test is automatic. We still mock it to be
// extra defensive against any canvas access in jsdom.
vi.mock('@/game/PhaserGame', () => ({
  default: () => null,
}));

describe('App smoke test', () => {
  beforeEach(() => {
    useAppStore.setState({
      screen: 'menu',
      pendingUpgrades: null,
      pendingResolver: null,
      lastSummary: null,
      bossActive: false,
    });
  });

  it('renders the main menu with a Play button by default', () => {
    render(<App />);
    expect(screen.getAllByText(/Crypto Arena Survivors/i).length).toBeGreaterThan(0);
    const playBtn = screen.getByRole('button', { name: /^play$/i });
    expect(playBtn).toBeInTheDocument();
  });

  it('Play button transitions the app into the playing screen', async () => {
    const user = userEvent.setup();
    render(<App />);
    const playBtn = screen.getByRole('button', { name: /^play$/i });
    await user.click(playBtn);
    expect(useAppStore.getState().screen).toBe('playing');
  });

  it('character select button switches screen to character-select', async () => {
    const user = userEvent.setup();
    render(<App />);
    const selectBtn = screen.getByRole('button', { name: /character select/i });
    await user.click(selectBtn);
    expect(useAppStore.getState().screen).toBe('character-select');
  });
});
