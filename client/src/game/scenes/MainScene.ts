import Phaser from 'phaser';
import { getCharacter, type CharacterId } from '@/data/characters';
import { getWeapon, type WeaponId } from '@/data/weapons';
import {
  makePlayerState,
  applyIncomingDamage,
  gainXp,
  tickHpRegen,
  type PlayerState,
} from '@/game/systems/Player';
import {
  makeWeaponRuntime,
  tickWeapons,
  effectiveProjectileCount,
  effectiveDamage,
  fanAngles,
  rollDamage,
  type WeaponRuntime,
} from '@/game/systems/Weapons';
import {
  drawUpgrades,
  applyUpgrade,
} from '@/game/systems/Upgrades';
import {
  pickEnemyForWave,
  spawnCountForWave,
  WAVE_INTERVAL_SEC,
} from '@/game/systems/Enemies';
import { type EnemyDef } from '@/data/enemies';
import {
  makeScaledBoss,
  makeBossState,
  tickBoss,
  type BossState,
} from '@/game/systems/Boss';
import { VirtualJoystick } from './VirtualJoystick';
import type { GameEvents } from '@/game/events';
import { useAppStore } from '@/state/store';

const ARENA_W = 1600;
const ARENA_H = 1200;
const BOSS_LEVEL_INTERVAL = 10; // Boss spawns at level 10, 20, 30...

interface BulletData {
  damage: number;
  pierce: number;
  hitSet: Set<number>;
}

interface EnemyData {
  def: EnemyDef;
  hp: number;
}

interface SceneInit {
  characterId: CharacterId;
  events: GameEvents;
}

export class MainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerState!: PlayerState;
  private playerNameText: Phaser.GameObjects.Text | null = null;
  private weaponRuntimes: WeaponRuntime[] = [];
  private wasdKeys!: Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', Phaser.Input.Keyboard.Key>;
  private joystick!: VirtualJoystick;

  private enemies!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private bossBullets!: Phaser.Physics.Arcade.Group;
  private gems!: Phaser.Physics.Arcade.Group;

  private bosses: Map<number, Phaser.Physics.Arcade.Sprite> = new Map();
  private bossStates: Map<number, BossState> = new Map();
  private bossTelegrahs: Map<number, Phaser.GameObjects.Image> = new Map();
  private bossTelegraphPos: Map<number, { x: number; y: number }> = new Map();
  private bossHpBars: Map<number, Phaser.GameObjects.Graphics> = new Map();
  private bossHpTexts: Map<number, Phaser.GameObjects.Text> = new Map();
  private bossNameTexts: Map<number, Phaser.GameObjects.Text> = new Map();
  private spawnedBossLevels: Set<number> = new Set();

  private waveIndex = 0;
  private timeSinceWaveSec = 0;
  private elapsedSec = 0;
  private bossNumber = 0;
  private paused = false;
  private gameEnded = false;
  private freezeTimer = 0;

  private events_!: GameEvents;
  private characterId: CharacterId = 'potato-soldier';
  private godMode = false;
  private oneHitMode = false;
  private speedMultiplier = 1;

  constructor() {
    super('MainScene');
  }

  init(data: SceneInit): void {
    this.characterId = data.characterId;
    this.events_ = data.events;
    this.waveIndex = 0;
    this.timeSinceWaveSec = 0;
    this.elapsedSec = 0;
    this.bossNumber = 0;
    this.paused = false;
    this.gameEnded = false;
    this.freezeTimer = 0;
    this.bosses.clear();
    this.bossStates.clear();
    this.bossTelegrahs.clear();
    this.bossTelegraphPos.clear();
    this.bossHpBars.clear();
    this.bossHpTexts.clear();
    this.bossNameTexts.clear();
    this.spawnedBossLevels.clear();
  }

  create(): void {
    this.physics.world.setBounds(0, 0, ARENA_W, ARENA_H);
    this.cameras.main.setBackgroundColor(0x0b0d12);

    // Subtle grid for spatial reference (procedural; no asset).
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x1c2233, 1);
    for (let x = 0; x <= ARENA_W; x += 80) {
      grid.lineBetween(x, 0, x, ARENA_H);
    }
    for (let y = 0; y <= ARENA_H; y += 80) {
      grid.lineBetween(0, y, ARENA_W, y);
    }

    const character = getCharacter(this.characterId);
    this.playerState = makePlayerState(character);

    this.player = this.physics.add.sprite(ARENA_W / 2, ARENA_H / 2, `char-${character.id}`);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    this.player.setData('id', 'player');
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setBounds(0, 0, ARENA_W, ARENA_H);

    const username = useAppStore.getState().username || 'Player';
    this.playerNameText = this.add.text(this.player.x, this.player.y + 50, username, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#a0d8ff',
      stroke: '#000',
      strokeThickness: 2,
    });
    this.playerNameText.setOrigin(0.5);
    this.playerNameText.setDepth(10);

    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.bossBullets = this.physics.add.group();
    this.gems = this.physics.add.group();

    this.weaponRuntimes = this.playerState.weapons.map(makeWeaponRuntime);

    // Input
    const kb = this.input.keyboard;
    if (kb) {
      this.wasdKeys = {
        W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        UP: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
        DOWN: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
        LEFT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
        RIGHT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      };
      kb.on('keydown-ESC', () => {
        if (!this.gameEnded) this.togglePause();
      });
    }
    this.joystick = new VirtualJoystick(this);

    // Collisions
    this.physics.add.overlap(this.bullets, this.enemies, (a, b) => {
      this.onBulletEnemy(a as Phaser.Physics.Arcade.Sprite, b as Phaser.Physics.Arcade.Sprite);
    });
    this.physics.add.overlap(this.player, this.enemies, (_a, b) => {
      this.onPlayerEnemy(b as Phaser.Physics.Arcade.Sprite);
    });
    this.physics.add.overlap(this.player, this.gems, (_a, b) => {
      this.onPlayerGem(b as Phaser.Physics.Arcade.Sprite);
    });
    this.physics.add.overlap(this.player, this.bossBullets, (_a, b) => {
      this.onPlayerBossBullet(b as Phaser.Physics.Arcade.Sprite);
    });

    this.publishHud();
    this.spawnWave();

    // Expose dev hooks for tester panel
    this.exposeDevHooks();
  }

  private exposeDevHooks(): void {
    const w = window as unknown as { __cas_dev?: Record<string, unknown> };
    w.__cas_dev = {
      gainXp: (amount: number) => {
        const { leveledUp } = gainXp(this.playerState, amount);
        if (leveledUp) this.openLevelUpPicker();
      },
      forceLevelUp: () => {
        const need = this.playerState.xpToNext - this.playerState.xp;
        gainXp(this.playerState, need);
        this.openLevelUpPicker();
      },
      spawnBossNow: () => {
        let levelMultiple = Math.floor(this.playerState.level / BOSS_LEVEL_INTERVAL) * BOSS_LEVEL_INTERVAL;
        if (levelMultiple === 0) levelMultiple = BOSS_LEVEL_INTERVAL;
        if (!this.spawnedBossLevels.has(levelMultiple)) {
          this.spawnBoss(levelMultiple);
        }
      },
      killBoss: () => {
        if (this.bosses.size === 0) return;
        const firstBossId = this.bosses.keys().next().value;
        const bossState = this.bossStates.get(firstBossId);
        if (bossState) {
          bossState.hp = 0;
          this.killBoss(firstBossId);
        }
      },
      toggleGodMode: () => {
        this.godMode = !this.godMode;
        return this.godMode;
      },
      isGodMode: () => this.godMode,
      setSpeed: (mul: number) => {
        this.speedMultiplier = Math.max(0.25, Math.min(8, mul));
      },
      getSpeed: () => this.speedMultiplier,
      healFull: () => {
        this.playerState.hp = this.playerState.stats.maxHp;
      },
      jumpToLevel: (target: number) => {
        const clamped = Math.max(1, Math.min(99, Math.floor(target)));
        while (this.playerState.level < clamped) {
          const need = this.playerState.xpToNext - this.playerState.xp;
          this.playerState.xp = 0;
          this.playerState.level += 1;
          this.playerState.xpToNext = Math.floor(4 + Math.pow(this.playerState.level, 1.4) * 3);
          void need;
        }
      },
      grantFreezeBlast: () => {
        useAppStore.getState().addLegendarySkill({
          id: 'freeze-blast',
          name: 'Freeze Blast',
          description: 'Freeze all non-boss enemies for 3-5 seconds',
          color: 0x66ddff,
          charges: 1,
        });
      },
      grantPurgeBolt: () => {
        useAppStore.getState().addLegendarySkill({
          id: 'purge-bolt',
          name: 'Purge Bolt',
          description: 'Instantly kill all non-boss enemies',
          color: 0xffd24a,
          charges: 1,
        });
      },
    };
  }

  // ---------- input ----------
  private getMoveDir(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.wasdKeys) {
      if (this.wasdKeys.A.isDown || this.wasdKeys.LEFT.isDown) x -= 1;
      if (this.wasdKeys.D.isDown || this.wasdKeys.RIGHT.isDown) x += 1;
      if (this.wasdKeys.W.isDown || this.wasdKeys.UP.isDown) y -= 1;
      if (this.wasdKeys.S.isDown || this.wasdKeys.DOWN.isDown) y += 1;
    }
    if (x === 0 && y === 0) {
      x = this.joystick.dirX;
      y = this.joystick.dirY;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  // ---------- update ----------
  override update(_time: number, deltaMs: number): void {
    if (this.gameEnded) return;
    if (this.paused) return;
    // Apply tester speed multiplier (game-speed scaling)
    const scaledMs = deltaMs * this.speedMultiplier;
    const dt = scaledMs / 1000;
    deltaMs = scaledMs;
    this.elapsedSec += dt;

    if (this.godMode) {
      this.playerState.hp = this.playerState.stats.maxHp;
    }

    // Decay freeze timer
    if (this.freezeTimer > 0) {
      this.freezeTimer = Math.max(0, this.freezeTimer - dt);
    }

    // Handle pending legendary skill activation
    const pending = useAppStore.getState().pendingLegendaryActivation;
    if (pending) {
      useAppStore.getState().clearLegendaryActivation();
      if (pending === 'freeze-blast') this.activateFreezeBlast();
      else if (pending === 'purge-bolt') this.activatePurgeBolt();
    }

    // Move player
    const dir = this.getMoveDir();
    const speed = this.playerState.stats.moveSpeed;
    this.player.setVelocity(dir.x * speed, dir.y * speed);

    if (this.playerNameText) {
      this.playerNameText.setPosition(this.player.x, this.player.y + 50);
    }

    tickHpRegen(this.playerState, dt);

    // Update enemies (custom AI: chase, kite, charge, etc.)
    this.updateEnemies(dt);

    // Auto-fire weapons
    const ready = tickWeapons(this.weaponRuntimes, deltaMs, this.playerState);
    for (const rt of ready) {
      this.fireWeapon(rt.id);
    }

    // Wave timing
    this.timeSinceWaveSec += dt;
    if (this.timeSinceWaveSec >= WAVE_INTERVAL_SEC) {
      this.timeSinceWaveSec = 0;
      this.waveIndex += 1;
      this.spawnWave();
    }

    const levelMultiple = Math.floor(this.playerState.level / BOSS_LEVEL_INTERVAL) * BOSS_LEVEL_INTERVAL;
    if (levelMultiple > 0 && !this.spawnedBossLevels.has(levelMultiple)) {
      this.spawnBoss(levelMultiple);
    }

    this.bosses.forEach((boss, bossId) => {
      if (boss.active) {
        this.updateBoss(bossId, deltaMs);
      }
    });

    // Cleanup off-screen bullets
    this.cullBullets();

    if (this.playerState.hp <= 0 && !this.gameEnded) {
      this.particleBurst(this.player.x, this.player.y, 0xff5d8f, 40, 30, 150);
      this.endRun(false);
    }

    this.publishHud();
  }

  private publishHud(): void {
    this.events_.hudUpdate({
      hp: this.playerState.hp,
      maxHp: this.playerState.stats.maxHp,
      level: this.playerState.level,
      xp: this.playerState.xp,
      xpForNext: this.playerState.xpToNext,
      timeSec: this.elapsedSec,
      kills: this.playerState.kills,
      bossKills: this.bossNumber,
      weapons: [...this.playerState.weapons],
    });
  }

  // ---------- spawning ----------
  private spawnWave(): void {
    const count = spawnCountForWave(this.waveIndex);
    for (let i = 0; i < count; i += 1) {
      const def = pickEnemyForWave(this.waveIndex);
      this.spawnEnemyAt(def, this.pickEdgePosition());
    }
  }

  private pickEdgePosition(): { x: number; y: number } {
    const margin = 32;
    const cam = this.cameras.main;
    const side = Math.floor(Math.random() * 4);
    const x0 = cam.scrollX;
    const y0 = cam.scrollY;
    const x1 = x0 + cam.width;
    const y1 = y0 + cam.height;
    if (side === 0) return { x: Phaser.Math.Between(x0, x1), y: y0 - margin };
    if (side === 1) return { x: Phaser.Math.Between(x0, x1), y: y1 + margin };
    if (side === 2) return { x: x0 - margin, y: Phaser.Math.Between(y0, y1) };
    return { x: x1 + margin, y: Phaser.Math.Between(y0, y1) };
  }

  private spawnEnemyAt(def: EnemyDef, pos: { x: number; y: number }): Phaser.Physics.Arcade.Sprite {
    const e = this.enemies.create(pos.x, pos.y, `enemy-${def.id}`) as Phaser.Physics.Arcade.Sprite;
    e.setData('data', { def, hp: def.hp } satisfies EnemyData);
    e.setCollideWorldBounds(false);
    e.setDepth(5);
    return e;
  }

  // ---------- enemy AI ----------
  private updateEnemies(_dt: number): void {
    const px = this.player.x;
    const py = this.player.y;
    const frozen = this.freezeTimer > 0;
    this.enemies.children.iterate((obj) => {
      const e = obj as Phaser.Physics.Arcade.Sprite;
      const data = e.getData('data') as EnemyData | undefined;
      if (!data || !e.body) return true;
      if (frozen) {
        e.setVelocity(0, 0);
        e.setTint(0x66ddff);
        return true;
      }
      const dx = px - e.x;
      const dy = py - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const def = data.def;
      let speed = def.speed;
      if (def.ai === 'fast-chase' || def.ai === 'swarm') speed = def.speed;
      if (def.ai === 'tanky') speed = def.speed * 0.9;
      if (def.ai === 'kite') {
        // Keep distance: move away when close.
        if (dist < 220) {
          e.setVelocity((-dx / dist) * speed, (-dy / dist) * speed);
          return true;
        }
      }
      e.setVelocity((dx / dist) * speed, (dy / dist) * speed);
      return true;
    });
  }

  // ---------- combat ----------
  private fireWeapon(weaponId: WeaponId): void {
    const w = getWeapon(weaponId);
    if (!w.available) return;
    const target = this.findNearestEnemy(this.player.x, this.player.y, w.range);
    if (!target) return;
    const aim = Math.atan2(target.y - this.player.y, target.x - this.player.x);
    const projCount = effectiveProjectileCount(w, this.playerState);
    const angles = fanAngles(aim, projCount, w.spreadDeg);
    const baseDamage = effectiveDamage(w, this.playerState);

    for (const a of angles) {
      const damage = rollDamage(baseDamage, this.playerState);
      const bullet = this.bullets.create(this.player.x, this.player.y, `bullet-${w.id}`) as Phaser.Physics.Arcade.Sprite;
      bullet.setDepth(8);
      bullet.setVelocity(Math.cos(a) * w.projectileSpeed, Math.sin(a) * w.projectileSpeed);
      bullet.setData('data', {
        damage,
        pierce: w.pierce,
        hitSet: new Set<number>(),
      } satisfies BulletData);
      this.time.delayedCall(1500, () => {
        if (bullet.active) bullet.destroy();
      });
    }
  }

  private findNearestEnemy(x: number, y: number, range: number): Phaser.Physics.Arcade.Sprite | null {
    let best: Phaser.Physics.Arcade.Sprite | null = null;
    let bestDist = range;
    this.enemies.children.iterate((obj) => {
      const e = obj as Phaser.Physics.Arcade.Sprite;
      if (!e.active) return true;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
      return true;
    });
    if (!best) {
      this.bosses.forEach((b) => {
        if (!b.active) return;
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < bestDist) {
          bestDist = d;
          best = b;
        }
      });
    }
    return best;
  }

  private onBulletEnemy(bullet: Phaser.Physics.Arcade.Sprite, enemy: Phaser.Physics.Arcade.Sprite): void {
    const bd = bullet.getData('data') as BulletData | undefined;
    if (!bd) return;
    const id = enemy.getData('uid') as number | undefined;
    const eid = id ?? this.assignEnemyUid(enemy);
    if (bd.hitSet.has(eid)) return;
    bd.hitSet.add(eid);

    // Check if enemy is any boss
    let hitBossId: number | null = null;
    this.bosses.forEach((boss, bossId) => {
      if (boss === enemy) hitBossId = bossId;
    });

    if (hitBossId !== null) {
      const bossState = this.bossStates.get(hitBossId);
      if (bossState) {
        bossState.hp -= bd.damage;
        this.flash(enemy);
        if (bossState.hp <= 0) {
          this.killBoss(hitBossId);
        }
      }
    } else {
      const data = enemy.getData('data') as EnemyData | undefined;
      if (!data) return;
      data.hp -= bd.damage;
      this.flash(enemy);
      // Lifesteal
      if (this.playerState.stats.lifesteal > 0) {
        this.playerState.hp = Math.min(
          this.playerState.stats.maxHp,
          this.playerState.hp + bd.damage * this.playerState.stats.lifesteal,
        );
      }
      if (data.hp <= 0) {
        this.killEnemy(enemy, data.def);
      }
    }

    if (bd.pierce <= 0) {
      bullet.destroy();
    } else {
      bd.pierce -= 1;
    }
  }

  private assignEnemyUid(enemy: Phaser.Physics.Arcade.Sprite): number {
    const uid = Phaser.Math.Between(1, 1_000_000_000);
    enemy.setData('uid', uid);
    return uid;
  }

  private flash(target: Phaser.Physics.Arcade.Sprite): void {
    target.setTint(0xffffff);
    this.time.delayedCall(60, () => {
      if (target.active) target.clearTint();
    });
  }

  private killEnemy(enemy: Phaser.Physics.Arcade.Sprite, def: EnemyDef): void {
    this.playerState.kills += 1;
    const gem = this.gems.create(enemy.x, enemy.y, 'xp-gem') as Phaser.Physics.Arcade.Sprite;
    gem.setData('xp', def.xp);
    gem.setDepth(4);
    this.scheduleGemDespawn(gem);
    enemy.destroy();
  }

  /**
   * Auto-despawn XP gems after 30s to prevent unbounded gem accumulation
   * which causes performance degradation. Fades for the last 2s as a
   * visual cue that the gem is about to disappear.
   */
  private scheduleGemDespawn(gem: Phaser.Physics.Arcade.Sprite): void {
    const FADE_MS = 2000;
    const LIFETIME_MS = 30000;
    this.time.delayedCall(LIFETIME_MS - FADE_MS, () => {
      if (!gem.active) return;
      this.tweens.add({
        targets: gem,
        alpha: 0,
        duration: FADE_MS,
      });
    });
    this.time.delayedCall(LIFETIME_MS, () => {
      if (gem.active) gem.destroy();
    });
  }

  private onPlayerGem(gem: Phaser.Physics.Arcade.Sprite): void {
    const xp = (gem.getData('xp') as number | undefined) ?? 1;
    gem.destroy();
    const { leveledUp } = gainXp(this.playerState, xp);
    if (leveledUp) this.openLevelUpPicker();
  }

  private onPlayerEnemy(enemy: Phaser.Physics.Arcade.Sprite): void {
    const data = enemy.getData('data') as EnemyData | undefined;
    if (!data) return;
    const cooldown = (enemy.getData('hitCd') as number | undefined) ?? 0;
    if (cooldown > this.time.now) return;
    enemy.setData('hitCd', this.time.now + 600);
    applyIncomingDamage(this.playerState, data.def.damage);
  }

  private onPlayerBossBullet(bullet: Phaser.Physics.Arcade.Sprite): void {
    // Guard against null/undefined
    if (!bullet || !bullet.active) return;
    if (!this.player || !this.player.active) return;
    if (!this.playerState) return;

    const dmg = (bullet.getData('damage') as number | undefined) ?? 10;
    bullet.destroy();
    applyIncomingDamage(this.playerState, dmg);
  }

  private onPlayerBoss(bossId: number): void {
    const boss = this.bosses.get(bossId);
    const bossState = this.bossStates.get(bossId);
    if (!boss || !bossState) return;
    const cooldown = (boss.getData('hitCd') as number | undefined) ?? 0;
    if (cooldown > this.time.now) return;
    boss.setData('hitCd', this.time.now + 600);
    applyIncomingDamage(this.playerState, bossState.def.damage);
  }

  private cullBullets(): void {
    const cam = this.cameras.main;
    const margin = 200;
    const x0 = cam.scrollX - margin;
    const y0 = cam.scrollY - margin;
    const x1 = cam.scrollX + cam.width + margin;
    const y1 = cam.scrollY + cam.height + margin;
    const cull = (b: Phaser.Physics.Arcade.Sprite) => {
      if (!b || !b.active) return;
      if (b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) b.destroy();
    };
    this.bullets.children.iterate((o) => {
      cull(o as Phaser.Physics.Arcade.Sprite);
      return true;
    });
    this.bossBullets.children.iterate((o) => {
      cull(o as Phaser.Physics.Arcade.Sprite);
      return true;
    });
  }

  // ---------- boss ----------
  private spawnBoss(levelMultiple: number): void {
    this.spawnedBossLevels.add(levelMultiple);
    const bossId = this.bossNumber;
    this.bossNumber += 1;
    const encounterNumber = bossId + 1;
    const def = makeScaledBoss(encounterNumber);
    const pos = this.pickEdgePosition();
    const boss = this.physics.add.sprite(pos.x, pos.y, `boss-${def.baseId}`);
    boss.setScale(2);
    boss.setDepth(11);
    const bossState = makeBossState(def);

    this.bosses.set(bossId, boss);
    this.bossStates.set(bossId, bossState);

    this.particleBurst(pos.x, pos.y, def.color, 30, 50, 200);
    this.cameras.main.shake(300, 0.005);
    this.events_.bossSpawn(encounterNumber, def.name);

    this.particleBurst(pos.x, pos.y, 0xff3060, 30, 50, 200);

    const bossNameText = this.add.text(boss.x, boss.y - 100, def.name, {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#ffaa00',
      stroke: '#000',
      strokeThickness: 3,
      fontStyle: 'bold',
    });
    bossNameText.setOrigin(0.5);
    bossNameText.setDepth(12);
    this.bossNameTexts.set(bossId, bossNameText);

    const bossHpBar = this.add.graphics();
    bossHpBar.setDepth(12);
    this.bossHpBars.set(bossId, bossHpBar);

    this.physics.add.overlap(this.player, boss, () => {
      this.onPlayerBoss(bossId);
    });

    this.enemies.add(boss);
  }

  private updateBoss(bossId: number, deltaMs: number): void {
    const boss = this.bosses.get(bossId);
    const bossState = this.bossStates.get(bossId);
    if (!boss || !bossState) return;

    const dx = this.player.x - boss.x;
    const dy = this.player.y - boss.y;
    const dist = Math.hypot(dx, dy) || 1;

    if (bossState.phase === 'dash') {
      const speed = bossState.def.dashSpeed;
      boss.setVelocity((dx / dist) * speed, (dy / dist) * speed);
    } else if (bossState.phase === 'idle' || bossState.phase === 'aoe-telegraph') {
      const speed = bossState.def.speed;
      boss.setVelocity((dx / dist) * speed, (dy / dist) * speed);
    } else {
      boss.setVelocity(0, 0);
    }

    const evts = tickBoss(bossState, deltaMs);

    const bossNameText = this.bossNameTexts.get(bossId);
    if (bossNameText) {
      bossNameText.setPosition(boss.x, boss.y - 100);
    }

    const bossHpBar = this.bossHpBars.get(bossId);
    if (bossHpBar) {
      bossHpBar.clear();
      const barW = 200;
      const barH = 16;
      const barX = boss.x - barW / 2;
      const barY = boss.y - 80;
      const hpRatio = Math.max(0, bossState.hp / bossState.def.hp);
      bossHpBar.fillStyle(0x333333, 1);
      bossHpBar.fillRect(barX, barY, barW, barH);
      bossHpBar.fillStyle(0xff3060, 1);
      bossHpBar.fillRect(barX, barY, barW * hpRatio, barH);
      bossHpBar.lineStyle(2, 0xffaa00, 1);
      bossHpBar.strokeRect(barX, barY, barW, barH);

      let bossHpText = this.bossHpTexts.get(bossId);
      if (!bossHpText) {
        bossHpText = this.add.text(barX + barW / 2, barY + barH / 2, '', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffffff',
          stroke: '#000',
          strokeThickness: 2,
        }).setOrigin(0.5).setDepth(13);
        this.bossHpTexts.set(bossId, bossHpText);
      }
      bossHpText.setPosition(barX + barW / 2, barY + barH / 2);
      bossHpText.setText(`${Math.round(hpRatio * 100)}%`);
    }

    if (evts.fireRing) {
      this.fireBossRing(bossId);
    }

    if (bossState.phase === 'aoe-telegraph' && !this.bossTelegrahs.has(bossId)) {
      const telegraphX = this.player.x;
      const telegraphY = this.player.y;
      this.bossTelegraphPos.set(bossId, { x: telegraphX, y: telegraphY });
      const telegraph = this.add
        .image(telegraphX, telegraphY, 'aoe-telegraph')
        .setDepth(9)
        .setAlpha(0.5);
      this.bossTelegrahs.set(bossId, telegraph);
      this.tweens.add({
        targets: telegraph,
        alpha: { from: 0.4, to: 0.95 },
        duration: bossState.def.aoeTelegraphMs,
      });
    }

    if (evts.detonate) {
      const telegraph = this.bossTelegrahs.get(bossId);
      const telegraphPos = this.bossTelegraphPos.get(bossId);
      if (telegraph && telegraphPos) {
        const radius = bossState.def.aoeRadius;
        const inRange = Math.hypot(this.player.x - telegraphPos.x, this.player.y - telegraphPos.y) <= radius;
        if (inRange) {
          applyIncomingDamage(this.playerState, bossState.def.damage);
        }
        telegraph.destroy();
        this.bossTelegrahs.delete(bossId);
        this.bossTelegraphPos.delete(bossId);
      }
    }
  }

  private fireBossRing(bossId: number): void {
    const boss = this.bosses.get(bossId);
    const bossState = this.bossStates.get(bossId);
    if (!boss || !bossState) return;
    const def = bossState.def;
    for (let i = 0; i < def.ringBulletCount; i += 1) {
      const a = (i / def.ringBulletCount) * Math.PI * 2;
      const b = this.bossBullets.create(boss.x, boss.y, 'boss-bullet') as Phaser.Physics.Arcade.Sprite;
      b.setVelocity(Math.cos(a) * def.ringBulletSpeed, Math.sin(a) * def.ringBulletSpeed);
      b.setData('damage', def.ringBulletDamage);
      b.setDepth(8);
      this.time.delayedCall(4000, () => {
        if (b.active) b.destroy();
      });
    }
  }

  private killBoss(bossId: number): void {
    const boss = this.bosses.get(bossId);
    const bossState = this.bossStates.get(bossId);
    if (!boss || !bossState) return;
    const bx = boss.x;
    const by = boss.y;
    const xpDrop = bossState.def.xp;
    const coinDrop = bossState.def.coins;
    const defeated = this.bossNumber;
    this.bossNumber += 1;
    this.cameras.main.shake(400, 0.012);
    this.particleBurst(bx, by, 0xffd24a, 50, 40, 180);
    this.celebrateBossKill(bx, by);
    for (let i = 0; i < 25; i += 1) {
      const angle = (i / 25) * Math.PI * 2;
      const gem = this.gems.create(
        bx + Math.cos(angle) * 20,
        by + Math.sin(angle) * 20,
        'xp-gem',
      ) as Phaser.Physics.Arcade.Sprite;
      gem.setData('xp', Math.max(4, Math.floor(xpDrop / 25)));
      gem.setDepth(4);
      this.scheduleGemDespawn(gem);
    }
    useAppStore.getState().addCoins(coinDrop);
    boss.destroy();
    this.bosses.delete(bossId);
    this.bossStates.delete(bossId);
    const telegraph = this.bossTelegrahs.get(bossId);
    if (telegraph) {
      telegraph.destroy();
      this.bossTelegrahs.delete(bossId);
    }
    this.bossTelegraphPos.delete(bossId);
    const hpBar = this.bossHpBars.get(bossId);
    if (hpBar) {
      hpBar.destroy();
      this.bossHpBars.delete(bossId);
    }
    const hpText = this.bossHpTexts.get(bossId);
    if (hpText) {
      hpText.destroy();
      this.bossHpTexts.delete(bossId);
    }
    const nameText = this.bossNameTexts.get(bossId);
    if (nameText) {
      nameText.destroy();
      this.bossNameTexts.delete(bossId);
    }
    this.events_.bossDefeated(defeated);
  }

  private celebrateBossKill(x: number, y: number): void {
    for (let i = 0; i < 40; i += 1) {
      const angle = (i / 40) * Math.PI * 2;
      const dist = 60 + Math.random() * 80;
      const p = this.add.circle(x, y, 4 + Math.random() * 4, 0xffd24a, 1);
      p.setDepth(20);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 800 + Math.random() * 400,
        onComplete: () => p.destroy(),
      });
    }
    const txt = this.add.text(x, y - 60, 'BOSS DEFEATED!', {
      fontFamily: 'Arial',
      fontSize: '32px',
      color: '#ffd24a',
      stroke: '#000',
      strokeThickness: 4,
      fontStyle: 'bold',
    });
    txt.setOrigin(0.5);
    txt.setDepth(25);
    this.tweens.add({
      targets: txt,
      y: y - 140,
      alpha: 0,
      scale: 1.5,
      duration: 1800,
      ease: 'Power2',
      onComplete: () => txt.destroy(),
    });
    const flash = this.add.rectangle(
      this.cameras.main.scrollX + this.cameras.main.width / 2,
      this.cameras.main.scrollY + this.cameras.main.height / 2,
      this.cameras.main.width,
      this.cameras.main.height,
      0xffd24a,
      0.5,
    );
    flash.setScrollFactor(0);
    flash.setDepth(30);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 400,
      onComplete: () => flash.destroy(),
    });
  }

  // ---------- level up ----------
  private openLevelUpPicker(): void {
    if (this.gameEnded) return;
    this.paused = true;
    this.physics.world.pause();
    const cards = drawUpgrades(3, this.playerState.stats.luck);
    this.events_.levelUp(cards, (chosen) => {
      applyUpgrade(this.playerState, chosen);
      
      if (chosen.effect.kind === 'build') {
        this.events_.skillGained({
          id: chosen.id,
          name: chosen.name,
          description: chosen.description,
          tier: chosen.tier,
          count: 1,
        });
      } else if (chosen.effect.kind === 'legendary') {
        this.events_.legendaryGained({
          id: chosen.effect.skillId,
          name: chosen.name,
          description: chosen.description,
          color: chosen.effect.skillId === 'freeze-blast' ? 0x66ddff : 0xffd24a,
          charges: 1,
        });
      }
      
      this.playerState.hp = Math.min(this.playerState.stats.maxHp, this.playerState.hp + 5);
      this.paused = false;
      this.physics.world.resume();
    });
  }

  // ---------- end ----------
  private endRun(victory: boolean): void {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.physics.world.pause();
    const summary = {
      timeSec: Math.floor(this.elapsedSec),
      kills: this.playerState.kills,
      level: this.playerState.level,
      bossKills: this.bossNumber,
      victory,
    };
    if (victory) this.events_.victory(summary);
    else this.events_.gameOver(summary);
  }

  private activateFreezeBlast(): void {
    this.freezeTimer = 3 + Math.random() * 2;
    this.cameras.main.flash(300, 100, 200, 255);
  }

  private activatePurgeBolt(): void {
    const killed: Phaser.Physics.Arcade.Sprite[] = [];
    this.enemies.children.iterate((obj) => {
      const e = obj as Phaser.Physics.Arcade.Sprite;
      if (e.active) killed.push(e);
      return true;
    });
    for (const e of killed) {
      const data = e.getData('data') as EnemyData | undefined;
      if (data) this.killEnemy(e, data.def);
    }
    this.cameras.main.flash(400, 255, 220, 100);
  }

  private togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) {
      this.physics.world.pause();
      useAppStore.getState().setScreen('paused');
    } else {
      this.physics.world.resume();
      useAppStore.getState().setScreen('playing');
    }
  }

  private particleBurst(x: number, y: number, color: number, count: number, minDist: number, maxDist: number): void {
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const dist = minDist + Math.random() * (maxDist - minDist);
      const p = this.add.circle(x, y, 3 + Math.random() * 3, color, 1);
      p.setDepth(15);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.3,
        duration: 600 + Math.random() * 400,
        onComplete: () => p.destroy(),
      });
    }
  }
}
