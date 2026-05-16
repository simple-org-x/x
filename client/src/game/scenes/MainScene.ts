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
  BOSS_WARDEN,
  makeBossState,
  tickBoss,
  type BossState,
} from '@/game/systems/Boss';
import { VirtualJoystick } from './VirtualJoystick';
import type { GameEvents } from '@/game/events';

const ARENA_W = 1600;
const ARENA_H = 1200;
const VICTORY_SECONDS = 15 * 60;
const BOSS_SPAWN_SECONDS = 3 * 60;

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

  private waveIndex = 0;
  private timeSinceWaveSec = 0;
  private elapsedSec = 0;
  private bossSpawned = false;
  private paused = false;
  private gameEnded = false;

  private events_!: GameEvents;
  private characterId: CharacterId = 'potato-soldier';

  constructor() {
    super('MainScene');
  }

  init(data: SceneInit): void {
    this.characterId = data.characterId;
    this.events_ = data.events;
    this.waveIndex = 0;
    this.timeSinceWaveSec = 0;
    this.elapsedSec = 0;
    this.bossSpawned = false;
    this.paused = false;
    this.gameEnded = false;
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
    const dt = deltaMs / 1000;
    this.elapsedSec += dt;

    // Move player
    const dir = this.getMoveDir();
    const speed = this.playerState.stats.moveSpeed;
    this.player.setVelocity(dir.x * speed, dir.y * speed);

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

    // Boss spawn
    if (!this.bossSpawned && this.elapsedSec >= BOSS_SPAWN_SECONDS) {
      this.spawnBoss();
    }

    if (this.boss && this.bossState) {
      this.updateBoss(deltaMs);
    }

    // Cleanup off-screen bullets
    this.cullBullets();

    // Victory
    if (this.elapsedSec >= VICTORY_SECONDS) {
      this.endRun(true);
    }

    if (this.playerState.hp <= 0 && !this.gameEnded) {
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
      xpToNext: this.playerState.xpToNext,
      timeSec: this.elapsedSec,
      kills: this.playerState.kills,
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
    this.enemies.children.iterate((obj) => {
      const e = obj as Phaser.Physics.Arcade.Sprite;
      const data = e.getData('data') as EnemyData | undefined;
      if (!data || !e.body) return true;
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
    const dmg = (bullet.getData('damage') as number | undefined) ?? 10;
    bullet.destroy();
    applyIncomingDamage(this.playerState, dmg);
  }

  private cullBullets(): void {
    const cam = this.cameras.main;
    const margin = 200;
    const x0 = cam.scrollX - margin;
    const y0 = cam.scrollY - margin;
    const x1 = cam.scrollX + cam.width + margin;
    const y1 = cam.scrollY + cam.height + margin;
    const cull = (b: Phaser.Physics.Arcade.Sprite) => {
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
    const pos = this.pickEdgePosition();
    this.boss = this.physics.add.sprite(pos.x, pos.y, `boss-${BOSS_WARDEN.id}`);
    this.boss.setScale(2);
    this.boss.setDepth(11);
    this.bossState = makeBossState(BOSS_WARDEN);
    this.cameras.main.shake(300, 0.005);
    this.events_.bossSpawn();
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
    if (!this.boss) return;
    this.cameras.main.shake(400, 0.012);
    for (let i = 0; i < 25; i += 1) {
      const angle = (i / 25) * Math.PI * 2;
      const gem = this.gems.create(
        this.boss.x + Math.cos(angle) * 20,
        this.boss.y + Math.sin(angle) * 20,
        'xp-gem',
      ) as Phaser.Physics.Arcade.Sprite;
      gem.setData('xp', 4);
      gem.setDepth(4);
    }
    this.boss.destroy();
    this.boss = null;
    this.bossState = null;
    if (this.bossTelegraph) {
      this.bossTelegraph.destroy();
      this.bossTelegraph = null;
    }
    this.endRun(true);
  }

  // ---------- level up ----------
  private openLevelUpPicker(): void {
    if (this.gameEnded) return;
    this.paused = true;
    this.physics.world.pause();
    const cards = drawUpgrades(3, this.playerState.stats.luck);
    this.events_.levelUp(cards, (chosen) => {
      applyUpgrade(this.playerState, chosen);
      // Heal slightly on level up to keep the game readable.
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
      victory,
    };
    if (victory) this.events_.victory(summary);
    else this.events_.gameOver(summary);
  }
}
