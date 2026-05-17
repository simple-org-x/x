import { useState, useEffect } from 'react';
import { useAppStore } from '@/state/store';
import { useI18n } from '@/i18n';

export default function UsernamePrompt() {
  const existingUsername = useAppStore((s) => s.username);
  const [input, setInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const setUsername = useAppStore((s) => s.setUsername);
  const setScreen = useAppStore((s) => s.setScreen);
  const { t } = useI18n();

  // Initialize input with existing username
  useEffect(() => {
    if (existingUsername) {
      setInput(existingUsername);
    }
  }, [existingUsername]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed.length === 0) return;
    setUsername(trimmed);
    setScreen('playing');
  };

  const handleUseExisting = () => {
    setScreen('playing');
  };

  // If user has existing username and hasn't started editing, show quick continue option
  const hasExisting = existingUsername.length > 0;

  return (
    <div className="cas-overlay">
      <div className="cas-card" style={{ maxWidth: 400 }}>
        <h2>{t('usernamePrompt.title')}</h2>
        <p style={{ color: 'var(--fg-soft)', marginBottom: 16 }}>
          Your name will appear below your character and on the leaderboard.
        </p>
        
        {hasExisting && !isEditing ? (
          <div>
            <div style={{ 
              padding: '12px 16px', 
              background: 'rgba(92,247,196,0.1)', 
              border: '1px solid rgba(92,247,196,0.3)',
              borderRadius: 8,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--fg-soft)', marginBottom: 4 }}>Current username</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--accent)' }}>{existingUsername}</div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                style={{ 
                  padding: '6px 12px', 
                  fontSize: 12,
                  background: 'transparent',
                  border: '1px solid rgba(92,247,196,0.4)',
                  color: 'var(--accent)',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Change
              </button>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleUseExisting} className="cas-btn cas-btn-primary" style={{ flex: 1 }}>
                {t('usernamePrompt.continue')}
              </button>
              <button
                type="button"
                className="cas-btn"
                onClick={() => setScreen('menu')}
              >
                {t('leaderboard.back')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('usernamePrompt.placeholder')}
              maxLength={20}
              autoFocus
              className="cas-input"
              style={{ width: '100%', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="submit" className="cas-btn cas-btn-primary" disabled={input.trim().length === 0}>
                {hasExisting ? 'Save & Continue' : t('usernamePrompt.continue')}
              </button>
              <button
                type="button"
                className="cas-btn"
                onClick={() => {
                  if (hasExisting && isEditing) {
                    setIsEditing(false);
                    setInput(existingUsername);
                  } else {
                    setScreen('menu');
                  }
                }}
              >
                {hasExisting && isEditing ? 'Cancel' : t('leaderboard.back')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
