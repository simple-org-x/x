import { useAppStore } from '@/state/store';

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
        <h2>{victory ? 'Victory!' : 'You died'}</h2>
        {summary ? (
          <div className="cas-stats-grid">
            <div>Time survived</div>
            <div>{fmtTime(summary.timeSec)}</div>
            <div>Kills</div>
            <div>{summary.kills}</div>
            <div>Bosses defeated</div>
            <div>{(summary as any).bossKills ?? 0}</div>
            <div>Final level</div>
            <div>{summary.level}</div>
          </div>
        ) : null}
        <div className="cas-row">
          <button onClick={onPlayAgain}>Play Again</button>
          <button onClick={onLeaderboard}>Leaderboard</button>
          <button onClick={onMenu}>Return to Menu</button>
        </div>
      </div>
    </div>
  );
}
