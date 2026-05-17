import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/state/store';
import { useI18n } from '@/i18n';

export default function UsernamePrompt() {
  const existingUsername = useAppStore((s) => s.username);
  const [input, setInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const setUsername = useAppStore((s) => s.setUsername);
  const setScreen = useAppStore((s) => s.setScreen);
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

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

  const hasExisting = existingUsername.length > 0;

  return (
    <div className="cas-overlay">
      <div className="cas-username-card">
        <div className="cas-username-header">
          <div className="cas-username-label">{t('usernamePrompt.callsign')}</div>
          <div className="cas-username-title">{t('usernamePrompt.identify')}</div>
        </div>
        
        <p className="cas-username-hint">
          {t('usernamePrompt.hint')}
        </p>
        
        {hasExisting && !isEditing ? (
          <div>
            <div className="cas-username-plaque">
              <div className="cas-plaque-label">{t('usernamePrompt.currentCallsign')}</div>
              <div className="cas-plaque-name">{existingUsername}</div>
              <div className="cas-plaque-glow"></div>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="cas-plaque-edit"
              >
                {t('usernamePrompt.modify')}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button onClick={handleUseExisting} className="cas-username-btn cas-username-btn-primary">
                {t('usernamePrompt.continue')}
              </button>
              <button
                type="button"
                className="cas-username-btn"
                onClick={() => setScreen('menu')}
              >
                {t('leaderboard.back')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className={`cas-terminal-input ${isFocused ? 'cas-terminal-input-focused' : ''}`}>
              <div className="cas-terminal-prompt">&gt;</div>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={t('usernamePrompt.placeholder')}
                maxLength={20}
                autoFocus
                className="cas-terminal-field"
              />
              <div className="cas-terminal-cursor"></div>
            </div>
            <div className="cas-terminal-meta">
              <span>{input.length}{t('usernamePrompt.charCount')}</span>
              <span className="cas-terminal-status">
                {input.trim().length > 0 ? t('usernamePrompt.ready') : t('usernamePrompt.awaiting')}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button 
                type="submit" 
                className="cas-username-btn cas-username-btn-primary" 
                disabled={input.trim().length === 0}
              >
                {hasExisting ? t('usernamePrompt.saveAndDeploy') : t('usernamePrompt.continue')}
              </button>
              <button
                type="button"
                className="cas-username-btn"
                onClick={() => {
                  if (hasExisting && isEditing) {
                    setIsEditing(false);
                    setInput(existingUsername);
                  } else {
                    setScreen('menu');
                  }
                }}
              >
                {hasExisting && isEditing ? t('usernamePrompt.cancel') : t('leaderboard.back')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
