import { useAppStore } from '@/state/store';
import { wallet } from '@/network/wallet';
import { useI18n } from '@/i18n';

const BOSS_NAMES = ['WARDEN', 'CRIMSON REAVER', 'VOID MONARCH', 'STORM TITAN'];
const BOSS_COLORS = ['#ff6666', '#ff3366', '#9944ff', '#44aaff'];

const ENEMIES = [
  { id: 0, shape: 'circle',  color: '#ff5d8f', left: '5%',  top: '15%', anim: 'enemyPath1', dur: 12 },
  { id: 1, shape: 'square',  color: '#ff9466', left: '18%', top: '70%', anim: 'enemyPath2', dur: 14 },
  { id: 2, shape: 'diamond', color: '#a35cff', left: '35%', top: '10%', anim: 'enemyPath3', dur: 10 },
  { id: 3, shape: 'triangle',color: '#4ea7ff', left: '50%', top: '80%', anim: 'enemyPath4', dur: 16 },
  { id: 4, shape: 'circle',  color: '#ff5d8f', left: '70%', top: '20%', anim: 'enemyPath5', dur: 13 },
  { id: 5, shape: 'square',  color: '#ff9466', left: '82%', top: '60%', anim: 'enemyPath6', dur: 11 },
  { id: 6, shape: 'diamond', color: '#a35cff', left: '65%', top: '85%', anim: 'enemyPath7', dur: 15 },
  { id: 7, shape: 'triangle',color: '#4ea7ff', left: '12%', top: '45%', anim: 'enemyPath8', dur: 9 },
  { id: 8, shape: 'circle',  color: '#ff5d8f', left: '45%', top: '55%', anim: 'enemyPath9', dur: 12 },
  { id: 9, shape: 'square',  color: '#ff9466', left: '92%', top: '35%', anim: 'enemyPath10',dur: 14 },
];

const BULLETS = [
  { id: 0, color: '#ffce5d', left: '48%', top: '48%', anim: 'bulletFire1', delay: 0 },
  { id: 1, color: '#5cf7c4', left: '52%', top: '52%', anim: 'bulletFire2', delay: 0.3 },
  { id: 2, color: '#ffce5d', left: '50%', top: '46%', anim: 'bulletFire3', delay: 0.6 },
  { id: 3, color: '#5cf7c4', left: '46%', top: '50%', anim: 'bulletFire4', delay: 0.15 },
  { id: 4, color: '#ffce5d', left: '54%', top: '50%', anim: 'bulletFire5', delay: 0.45 },
  { id: 5, color: '#5cf7c4', left: '50%', top: '54%', anim: 'bulletFire6', delay: 0.75 },
];

export default function MainMenu() {
  const setScreen = useAppStore((s) => s.setScreen);
  const selected = useAppStore((s) => s.selectedCharacter);
  const { t, language, setLanguage } = useI18n();

  const onPlay = () => setScreen('username');
  const onSelect = () => setScreen('character-select');
  const onHelp = () => setScreen('how-to-play');
  const onLeaderboard = () => setScreen('leaderboard');
  const onSkillList = () => setScreen('skill-list');
  const onConnect = () => {
    void wallet.connect();
  };
  const toggleLanguage = () => setLanguage(language === 'en' ? 'id' : 'en');

  return (
    <>
      {/* === Animated gameplay scene background === */}
      <div className="cas-arena-bg">
        {/* Glow domes */}
        <div className="cas-arena-glow cas-arena-glow-1" />
        <div className="cas-arena-glow cas-arena-glow-2" />
        <div className="cas-arena-glow cas-arena-glow-3" />

        {/* Grid floor */}
        <div className="cas-arena-grid" />

        {/* Player — large teal circle, wanders center area */}
        <div className="cas-game-entity cas-player" style={{ left: '47%', top: '45%' }} />

        {/* Enemies — geometric shapes chasing/wandering */}
        {ENEMIES.map((e) => (
          <div
            key={e.id}
            className={`cas-game-entity cas-enemy cas-enemy-${e.shape}`}
            style={{
              left: e.left, top: e.top,
              background: e.color,
              borderColor: 'rgba(255,255,255,0.4)',
              animationName: e.anim,
              animationDuration: `${e.dur}s`,
              boxShadow: `0 0 12px ${e.color}`,
            }}
          />
        ))}

        {/* Boss — large pulsing pentagon */}
        <div className="cas-boss" style={{ left: '72%', top: '22%', animation: 'bossMove 14s ease-in-out infinite' }}>
          <div className="cas-boss-inner" style={{ background: BOSS_COLORS[0], boxShadow: `0 0 40px 15px ${BOSS_COLORS[0]}40` }} />
          <div className="cas-boss-hp-bg" style={{ left: '50%', marginLeft: -40, top: -12 }}>
            <div className="cas-boss-hp-fill" />
          </div>
          <div className="cas-boss-name" style={{ left: '50%', transform: 'translateX(-50%)', top: -32 }}>
            {BOSS_NAMES[0]}
          </div>
        </div>

        {/* Bullets — streaking from player outward */}
        {BULLETS.map((b) => (
          <div
            key={b.id}
            className="cas-bullet"
            style={{
              left: b.left, top: b.top, color: b.color,
              background: b.color,
              boxShadow: `0 0 8px ${b.color}`,
              animation: `${b.anim} 1s ease-out ${b.delay}s infinite`,
            }}
          />
        ))}

        {/* Particle burst effects — golden boss death burst */}
        {[...Array(12)].map((_, i) => {
          const angle = (i / 12) * Math.PI * 2;
          const dist = 40 + Math.random() * 60;
          return (
            <div key={`burst-${i}`} className="cas-particle-burst-particle" style={{
              left: '76%', top: '25%',
              background: '#ffd24a',
              boxShadow: '0 0 6px #ffd24a',
              '--tx': `${Math.cos(angle) * dist}px`,
              '--ty': `${Math.sin(angle) * dist}px`,
              '--d': i * 20,
              '--dur': '1.2s',
              animationDelay: `${i * 0.08}s`,
              animationDuration: '1.2s',
            } as React.CSSProperties} />
          );
        })}

        {/* Scanlines */}
        <div className="cas-arena-scanlines" />
        {/* Vignette */}
        <div className="cas-arena-vignette" />
      </div>

      <div className="cas-overlay">
        <div className="cas-overlay-card cas-main-menu-card">
          <div className="cas-main-menu-title">
            <span className="cas-title-accent">{t('game.titleAccent')}</span>
            <span className="cas-title-main">{t('game.title')}</span>
          </div>
          <p className="cas-main-menu-subtitle">
            {t('mainMenu.phase1')} &bull; {selected}
          </p>
          <div className="cas-row" style={{ marginTop: 24, flexDirection: 'column', alignItems: 'stretch' }}>
            <button onClick={onPlay} aria-label="Play" className="cas-play-btn">{t('mainMenu.play')}</button>
            <button onClick={onSelect}>{t('mainMenu.characterSelect')}</button>
            <button onClick={onHelp}>{t('mainMenu.howToPlay')}</button>
            <button onClick={onSkillList}>{t('mainMenu.skillsDropRates')}</button>
            <button onClick={() => setScreen('boss-bestiary')}>{t('mainMenu.bossBestiary')}</button>
            <button onClick={onLeaderboard}>{t('mainMenu.leaderboard')}</button>
            <button onClick={toggleLanguage}>{t('mainMenu.language')}: {language.toUpperCase()}</button>
            <button onClick={onConnect}>{t('mainMenu.connectWallet')} <span style={{ opacity: 0.5 }}>{t('mainMenu.stub')}</span></button>
          </div>
          <p className="cas-main-menu-hint">{t('mainMenu.hint')}</p>
        </div>
      </div>
    </>
  );
}
