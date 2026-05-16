import { useAppStore } from '@/state/store';

export default function Leaderboard() {
  const records = useAppStore((s) => s.gameRecords);
  const setScreen = useAppStore((s) => s.setScreen);

  return (
    <div className="cas-overlay">
      <div className="cas-card" style={{ maxWidth: 600, maxHeight: '80vh', overflow: 'auto' }}>
        <h2>Leaderboard</h2>
        {records.length === 0 ? (
          <p style={{ color: 'var(--fg-soft)', textAlign: 'center', padding: 24 }}>
            No records yet. Play a game to appear on the leaderboard!
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a3142' }}>
                <th style={{ textAlign: 'left', padding: 8 }}>Rank</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Player</th>
                <th style={{ textAlign: 'center', padding: 8 }}>Bosses</th>
                <th style={{ textAlign: 'center', padding: 8 }}>Level</th>
                <th style={{ textAlign: 'center', padding: 8 }}>Time</th>
                <th style={{ textAlign: 'center', padding: 8 }}>Kills</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #1c2233' }}>
                  <td style={{ padding: 8, color: 'var(--fg-soft)' }}>{i + 1}</td>
                  <td style={{ padding: 8 }}>
                    <span style={{ color: r.victory ? '#5cf7c4' : '#ff9466' }}>
                      {r.username || 'Anonymous'}
                    </span>
                    <span style={{ color: 'var(--fg-soft)', fontSize: 11, marginLeft: 8 }}>
                      ({r.character})
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', padding: 8, color: '#ffd24a' }}>{r.bossKills}</td>
                  <td style={{ textAlign: 'center', padding: 8 }}>{r.level}</td>
                  <td style={{ textAlign: 'center', padding: 8, color: 'var(--fg-soft)' }}>
                    {Math.floor(r.timeSec / 60)}:{(r.timeSec % 60).toString().padStart(2, '0')}
                  </td>
                  <td style={{ textAlign: 'center', padding: 8 }}>{r.kills}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
          <button className="cas-btn cas-btn-primary" onClick={() => setScreen('menu')}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}
