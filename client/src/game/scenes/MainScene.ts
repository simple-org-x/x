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

  private boss: Phaser.Physics.Arcade.Sprite | null = null;
  private bossState: BossState | null = null;
  private bossTelegraph: Phaser.GameObjects.Image | null = null;
  private bossTelegraphX = 0;
  private bossTelegraphY = 0;
  private bossHpBar: Phaser.GameObjects.Graphics | null = null;
  private bossHpText: Phaser.GameObjects.Text | null = null;
  private bossNameText: Phaser.GameObjects.Text | null = null;

  private waveIndex = 0;
  private timeSinceWaveSec = 0;
  private elapsedSec = 0;
  private bossNumber = 0;
  private bossSpawned = false;
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
    this.bossSpawned = false;
    this.paused = false;
    this.gameEnded = false;
    this.freezeTimer = 0;
    this.boss = null;
    this.bossState = null;
    this.bossTelegraph = null;
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
        if (this.bossSpawned || this.boss) return;
        this.spawnBoss();
      },
      killBoss: () => {
        if (!this.boss || !this.bossState) return;
        this.bossState.hp = 0;
        this.killBoss();
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

    const levelMultiple = this.playerState.level % BOSS_LEVEL_INTERVAL === 0;
    if (!this.bossSpawned && levelMultiple && this.playerState.level > 0) {
      this.spawnBoss();
    }

    if (this.boss && this.bossState) {
      this.updateBoss(deltaMs);
    }

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
    if (!best && this.boss && this.boss.active) {
      const d = Math.hypot(this.boss.x - x, this.boss.y - y);
      if (d < range) return this.boss;
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

    const isBoss = enemy === this.boss;
    if (isBoss && this.bossState) {
      this.bossState.hp -= bd.damage;
      this.flash(enemy);
      if (this.bossState.hp <= 0) {
        this.killBoss();
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
    enemy.destroy();
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

  private onPlayerBoss(): void {
    if (!this.boss || !this.bossState) return;
    const cooldown = (this.boss.getData('hitCd') as number | undefined) ?? 0;
    if (cooldown > this.time.now) return;
    this.boss.setData('hitCd', this.time.now + 600);
    applyIncomingDamage(this.playerState, this.bossState.def.damage);
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
  private spawnBoss(): void {
    this.bossSpawned = true;
    const encounterNumber = this.bossNumber + 1;
    const def = makeScaledBoss(encounterNumber);
    const pos = this.pickEdgePosition();
    this.boss = this.physics.add.sprite(pos.x, pos.y, `boss-${def.baseId}`);
    this.boss.setScale(2);
    this.boss.setDepth(11);
    this.bossState = makeBossState(def);

    this.particleBurst(pos.x, pos.y, def.color, 30, 50, 200);
    this.cameras.main.shake(300, 0.005);
    this.events_.bossSpawn(encounterNumber, def.name);

    this.particleBurst(pos.x, pos.y, 0xff3060, 30, 50, 200);

    this.bossNameText = this.add.text(this.boss.x, this.boss.y - 100, def.name, {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#ffaa00',
      stroke: '#000',
      strokeThickness: 3,
      fontStyle: 'bold',
    });
    this.bossNameText.setOrigin(0.5);
    this.bossNameText.setDepth(12);

    // Boss HP bar (background)
    this.bossHpBar = this.add.graphics();
    this.bossHpBar.setDepth(12);

    this.physics.add.overlap(this.player, this.boss, () => {
      this.onPlayerBoss();
    });

    // Add boss to enemies group so bullet-vs-enemies overlap handles damage reliably
    this.enemies.add(this.boss);
  }

  private updateBoss(deltaMs: number): void {
    if (!this.boss || !this.bossState) return;
    const dx = this.player.x - this.boss.x;
    const dy = this.player.y - this.boss.y;
    const dist = Math.hypot(dx, dy) || 1;

    if (this.bossState.phase === 'dash') {
      const speed = this.bossState.def.dashSpeed;
      this.boss.setVelocity((dx / dist) * speed, (dy / dist) * speed);
    } else if (this.bossState.phase === 'idle' || this.bossState.phase === 'aoe-telegraph') {
      const speed = this.bossState.def.speed;
      this.boss.setVelocity((dx / dist) * speed, (dy / dist) * speed);
    } else {
      this.boss.setVelocity(0, 0);
    }

    const evts = tickBoss(this.bossState, deltaMs);

    if (this.bossNameText) {
      this.bossNameText.setPosition(this.boss.x, this.boss.y - 100);
    }

    if (this.bossHpBar) {
      this.bossHpBar.clear();
      const barW = 200;
      const barH = 16;
      const barX = this.boss.x - barW / 2;
      const barY = this.boss.y - 80;
      const hpRatio = Math.max(0, this.bossState.hp / this.bossState.def.hp);
      this.bossHpBar.fillStyle(0x333333, 1);
      this.bossHpBar.fillRect(barX, barY, barW, barH);
      this.bossHpBar.fillStyle(0xff3060, 1);
      this.bossHpBar.fillRect(barX, barY, barW * hpRatio, barH);
      this.bossHpBar.lineStyle(2, 0xffaa00, 1);
      this.bossHpBar.strokeRect(barX, barY, barW, barH);

      // HP percentage text
      if (!this.bossHpText) {
        this.bossHpText = this.add.text(barX + barW / 2, barY + barH / 2, '', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffffff',
          stroke: '#000',
          strokeThickness: 2,
        }).setOrigin(0.5).setDepth(13);
      }
      this.bossHpText.setPosition(barX + barW / 2, barY + barH / 2);
      this.bossHpText.setText(`${Math.round(hpRatio * 100)}%`);
    }

    if (evts.fireRing) {
      this.fireBossRing();
    }
    if (this.bossState.phase === 'aoe-telegraph' && !this.bossTelegraph) {
      this.bossTelegraphX = this.player.x;
      this.bossTelegraphY = this.player.y;
      this.bossTelegraph = this.add
        .image(this.bossTelegraphX, this.bossTelegraphY, 'aoe-telegraph')
        .setDepth(9)
        .setAlpha(0.5);
      this.tweens.add({
        targets: this.bossTelegraph,
        alpha: { from: 0.4, to: 0.95 },
        duration: this.bossState.def.aoeTelegraphMs,
      });
    }
    if (evts.detonate && this.bossTelegraph) {
      const radius = this.bossState.def.aoeRadius;
      const inRange = Math.hypot(this.player.x - this.bossTelegraphX, this.player.y - this.bossTelegraphY) <= radius;
      if (inRange) {
        applyIncomingDamage(this.playerState, this.bossState.def.damage);
      }
      this.bossTelegraph.destroy();
      this.bossTelegraph = null;
    }
  }

  private fireBossRing(): void {
    if (!this.boss || !this.bossState) return;
    const def = this.bossState.def;
    for (let i = 0; i < def.ringBulletCount; i += 1) {
      const a = (i / def.ringBulletCount) * Math.PI * 2;
      const b = this.bossBullets.create(this.boss.x, this.boss.y, 'boss-bullet') as Phaser.Physics.Arcade.Sprite;
      b.setVelocity(Math.cos(a) * def.ringBulletSpeed, Math.sin(a) * def.ringBulletSpeed);
      b.setData('damage', def.ringBulletDamage);
      b.setDepth(8);
      this.time.delayedCall(4000, () => {
        if (b.active) b.destroy();
      });
    }
  }

   private killBoss(): void {
    if (!this.boss || !this.bossState) return;
    const bx = this.boss.x;
    const by = this.boss.y;
    const xpDrop = this.bossState.def.xp;
    const coinDrop = this.bossState.def.coins;
    const defeated = this.bossNumber + 1;
    this.bossNumber = defeated;
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
    }
    useAppStore.getState().addCoins(coinDrop);
    this.boss.destroy();
    this.boss = null;
    this.bossState = null;
    if (this.bossTelegraph) {
      this.bossTelegraph.destroy();
      this.bossTelegraph = null;
    }
    if (this.bossHpBar) {
      this.bossHpBar.destroy();
      this.bossHpBar = null;
    }
    if (this.bossNameText) {
      this.bossNameText.destroy();
      this.bossNameText = null;
    }
    this.events_.bossDefeated(defeated);
    // Allow next boss to spawn at next level multiple
    this.bossSpawned = false;
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
