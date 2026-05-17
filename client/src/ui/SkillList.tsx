import { UPGRADES } from '@/data/upgrades';
import { useAppStore } from '@/state/store';
import { useI18n } from '@/i18n';

export default function SkillList() {
  const setScreen = useAppStore((s) => s.setScreen);
  const { t } = useI18n();

  const tierWeights = {
    common: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
  };
  const upgradeCounts = {
    common: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
  };

  for (const u of UPGRADES) {
    tierWeights[u.tier] += u.weight;
    upgradeCounts[u.tier] += 1;
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'common':
        return '#a0a0a0';
      case 'rare':
        return '#4ea7ff';
      case 'epic':
        return '#c77dff';
      case 'legendary':
        return '#ffd24a';
      default:
        return '#fff';
    }
  };

  const getTierDropChance = (tier: string) => {
    const tierUpgrades = UPGRADES.filter((u) => u.tier === tier);
    const tierWeight = tierUpgrades.reduce((sum, u) => sum + u.weight, 0);
    const totalWeight = UPGRADES.reduce((sum, u) => sum + u.weight, 0);
    return ((tierWeight / totalWeight) * 100).toFixed(1);
  };

  const getUpgradeDropChance = (upgradeWeight: number) => {
    const totalWeight = UPGRADES.reduce((sum, u) => sum + u.weight, 0);
    return ((upgradeWeight / totalWeight) * 100).toFixed(2);
  };

  const getTierName = (tier: string) => {
    return t(`skillList.tier${tier.charAt(0).toUpperCase() + tier.slice(1)}` as any);
  };

  return (
    <div className="cas-overlay">
      <div className="cas-card" style={{ maxWidth: 700, maxHeight: '85vh', overflow: 'auto' }}>
        <h2>{t('skillList.title')}</h2>
        <p style={{ color: 'var(--fg-soft)', marginBottom: 16, fontSize: 13 }}>
          {t('skillList.description')}
        </p>

        {(['common', 'rare', 'epic', 'legendary'] as const).map((tier) => {
          const tierUpgrades = UPGRADES.filter((u) => u.tier === tier);
          const tierChance = getTierDropChance(tier);

          return (
            <div key={tier} style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 12,
                  paddingBottom: 8,
                  borderBottom: `2px solid ${getTierColor(tier)}`,
                }}
              >
                <h3 style={{ margin: 0, color: getTierColor(tier), textTransform: 'capitalize' }}>
                  {getTierName(tier)}
                </h3>
                <span style={{ color: 'var(--fg-soft)', fontSize: 12 }}>
                  {tierUpgrades.length} skills • {tierChance}% {t('skillList.tierChance')}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {tierUpgrades.map((u) => (
                  <div
                    key={u.id}
                    style={{
                      background: 'rgba(42, 49, 66, 0.5)',
                      border: `1px solid ${getTierColor(tier)}`,
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ color: getTierColor(tier), fontWeight: 'bold', marginBottom: 4 }}>
                      {u.name}
                    </div>
                    <div style={{ color: 'var(--fg-soft)', marginBottom: 8, lineHeight: 1.4 }}>
                      {u.description}
                    </div>
                    <div style={{ color: '#ffd24a', fontSize: 11 }}>
                      {t('skillList.dropChance')}: {getUpgradeDropChance(u.weight)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          <button className="cas-btn cas-btn-primary" onClick={() => setScreen('menu')}>
            {t('skillList.back')}
          </button>
        </div>
      </div>
    </div>
  );
}
