import { useAppStore } from '@/state/store';
import { useI18n } from '@/i18n';

export default function PauseOverlay() {
  const setScreen = useAppStore((s) => s.setScreen);
  const { t } = useI18n();

  const handleResume = () => {
    setScreen('playing');
  };

  const handleQuit = () => {
    setScreen('menu');
  };

  return (
    <div className="cas-overlay">
      <div className="cas-card" style={{ maxWidth: 400 }}>
        <h2>{t('pauseOverlay.title')}</h2>
        <p style={{ color: 'var(--fg-soft)', marginBottom: 16 }}>
          {t('hud.pauseHint')}
        </p>
        <div style={{ display: 'flex', gap: 12, flexDirection: 'column' }}>
          <button className="cas-btn cas-btn-primary" onClick={handleResume}>
            {t('pauseOverlay.resume')}
          </button>
          <button className="cas-btn" onClick={handleQuit}>
            {t('pauseOverlay.quitToMenu')}
          </button>
        </div>
      </div>
    </div>
  );
}
