import { useAppStore } from '@/state/store';
import { useI18n } from '@/i18n';

export default function Leaderboard() {
  const records = useAppStore((s) => s.gameRecords);
  const setScreen = useAppStore((s) => s.setScreen);
  const { t } = useI18n();

  return (
    <div className="cas-overlay">
      <div className="cas-card" style={{ maxWidth: 600, maxHeight: '80vh', overflow: 'auto' }}>
        <h2>{t('leaderboard.title')}</h2>
        {records.length === 0 ? (
          <p style={{ color: 'var(--fg-soft)', textAlign: 'center', padding: 24 }}>
            {t('leaderboard.noRecords')}
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a3142' }}>
                <th style={{ textAlign: 'left', padding: 8 }}>{t('leaderboard.rank')}</th>
                <th style={{ textAlign: 'left', padding: 8 }}>{t('leaderboard.player')}</th>
                <th style={{ textAlign: 'center', padding: 8 }}>{t('leaderboard.bosses')}</th>
                <th style={{ textAlign: 'center', padding: 8 }}>{t('leaderboard.level')}</th>
                <th style={{ textAlign: 'center', padding: 8 }}>{t('leaderboard.time')}</th>
                <th style={{ textAlign: 'center', padding: 8 }}>{t('leaderboard.kills')}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #1c2233' }}>
                  <td style={{ padding: 8, color: 'var(--fg-soft)' }}>{i + 1}</td>
                  <td style={{ padding: 8 }}>
                    <span style={{ color: r.victory ? '#5cf7c4' : '#ff9466' }}>
                      {r.username || t('leaderboard.anonymous')}
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
            {t('leaderboard.back')}
          </button>
        </div>
      </div>
    </div>
  );
}
