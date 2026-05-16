import { useState } from 'react';
import { useAppStore } from '@/state/store';

export default function UsernamePrompt() {
  const [input, setInput] = useState('');
  const setUsername = useAppStore((s) => s.setUsername);
  const setScreen = useAppStore((s) => s.setScreen);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed.length === 0) return;
    setUsername(trimmed);
    setScreen('playing');
  };

  return (
    <div className="cas-overlay">
      <div className="cas-card" style={{ maxWidth: 400 }}>
        <h2>Enter Your Name</h2>
        <p style={{ color: 'var(--fg-soft)', marginBottom: 16 }}>
          Your name will appear below your character and on the leaderboard.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter username"
            maxLength={20}
            autoFocus
            className="cas-input"
            style={{ width: '100%', marginBottom: 16 }}
          />
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="submit" className="cas-btn cas-btn-primary" disabled={input.trim().length === 0}>
              Start Game
            </button>
            <button
              type="button"
              className="cas-btn"
              onClick={() => setScreen('menu')}
            >
              Back
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
