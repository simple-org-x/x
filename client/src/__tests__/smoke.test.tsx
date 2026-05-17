import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { useAppStore } from '@/state/store';
import { LanguageProvider } from '@/i18n';

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
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>
    );
    expect(screen.getAllByText(/Crypto Arena Survivors/i).length).toBeGreaterThan(0);
    const playBtn = screen.getByRole('button', { name: /^play$/i });
    expect(playBtn).toBeInTheDocument();
  });

  it('Play button transitions the app into the playing screen', async () => {
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>
    );
    const playBtn = screen.getByRole('button', { name: /^play$/i });
    await user.click(playBtn);
    // New flow: Play → username screen
    expect(useAppStore.getState().screen).toBe('username');
    
    // Enter username and continue
    const usernameInput = screen.getByPlaceholderText(/callsign/i);
    await user.type(usernameInput, 'TestPlayer');
    
    const saveBtn = screen.getByRole('button', { name: /save|deploy|continue/i });
    await user.click(saveBtn);
    
    // Should now be in playing screen
    expect(useAppStore.getState().screen).toBe('playing');
  });

  it('character select button switches screen to character-select', async () => {
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>
    );
    const selectBtn = screen.getByRole('button', { name: /character select/i });
    await user.click(selectBtn);
    expect(useAppStore.getState().screen).toBe('character-select');
  });
});
