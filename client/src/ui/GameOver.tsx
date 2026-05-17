import { useAppStore } from '@/state/store';
import { useI18n } from '@/i18n';

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function GameOver({ victory }: { victory: boolean }) {
  const summary = useAppStore((s) => s.lastSummary);
  const setScreen = useAppStore((s) => s.setScreen);
  const resetHud = useAppStore((s) => s.resetHud);
  const resetSkills = useAppStore((s) => s.resetSkills);
  const saveGameRecord = useAppStore((s) => s.saveGameRecord);
  const username = useAppStore((s) => s.username);
  const selectedCharacter = useAppStore((s) => s.selectedCharacter);
  const { t } = useI18n();

  const onPlayAgain = () => {
    resetHud();
    resetSkills();
    setScreen('playing');
  };
  const onMenu = () => {
    resetHud();
    resetSkills();
    setScreen('menu');
  };
  const onLeaderboard = () => {
    if (summary && username) {
      saveGameRecord({
        username,
        character: selectedCharacter,
        timeSec: summary.timeSec,
        kills: summary.kills,
        bossKills: (summary as any).bossKills ?? 0,
        level: summary.level,
        victory: summary.victory,
        at: new Date().toISOString(),
      });
    }
    setScreen('leaderboard');
  };

  return (
    <div className="cas-overlay">
      <div className="cas-overlay-card">
        <h2>{victory ? t('gameOver.victory') : t('gameOver.title')}</h2>
        {summary ? (
          <div className="cas-stats-grid">
            <div>{t('gameOver.timeSurvived')}</div>
            <div>{fmtTime(summary.timeSec)}</div>
            <div>{t('gameOver.enemiesKilled')}</div>
            <div>{summary.kills}</div>
            <div>{t('gameOver.bossesDefeated')}</div>
            <div>{(summary as any).bossKills ?? 0}</div>
            <div>{t('gameOver.levelReached')}</div>
            <div>{summary.level}</div>
          </div>
        ) : null}
        <div className="cas-row">
          <button onClick={onPlayAgain}>{t('gameOver.playAgain')}</button>
          <button onClick={onLeaderboard}>{t('gameOver.viewLeaderboard')}</button>
          <button onClick={onMenu}>{t('gameOver.mainMenu')}</button>
        </div>
      </div>
    </div>
  );
}
