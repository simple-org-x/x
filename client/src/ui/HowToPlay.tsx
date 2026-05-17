import { useAppStore } from '@/state/store';
import { useI18n } from '@/i18n';

export default function HowToPlay() {
  const setScreen = useAppStore((s) => s.setScreen);
  const { t } = useI18n();
  return (
    <div className="cas-overlay">
      <div className="cas-overlay-card" style={{ minWidth: 'min(560px, 92vw)' }}>
        <h2>{t('howToPlay.title')}</h2>
        <div className="cas-help">
          <p>
            <strong>{t('howToPlay.controls')}</strong>: {t('howToPlay.controlsText')}
          </p>
          <p>
            <strong>{t('howToPlay.objective')}</strong>: {t('howToPlay.objectiveText')}
          </p>
          <p>
            <strong>{t('howToPlay.skills')}</strong>: {t('howToPlay.skillsText')}
          </p>
          <p>
            <strong>{t('howToPlay.coins')}</strong>: {t('howToPlay.coinsText')}
          </p>
        </div>
        <div className="cas-row" style={{ marginTop: 18 }}>
          <button onClick={() => setScreen('menu')}>{t('howToPlay.back')}</button>
        </div>
      </div>
    </div>
  );
}
