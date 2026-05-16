import Phaser from 'phaser';
import { CHARACTERS } from '@/data/characters';
import { ENEMIES, type EnemyShape } from '@/data/enemies';
import { WEAPONS } from '@/data/weapons';
import { BOSS_WARDEN } from '@/game/systems/Boss';

/**
 * BootScene draws every sprite the game uses with `Phaser.GameObjects.Graphics`
 * and bakes it to a texture via `generateTexture`. This keeps the build asset
 * footprint at zero bytes while still giving each entity a recognizable look.
 *
 * Texture key conventions:
 *   - char-<characterId>     player sprite
 *   - enemy-<enemyId>        enemy sprite
 *   - boss-<bossId>          boss sprite
 *   - bullet-<weaponId>      projectile sprite
 *   - boss-bullet            ring projectile sprite
 *   - xp-gem                 XP pickup
 *   - coin                   soft currency pickup
 *   - aoe-telegraph          flashing circle outline
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    for (const c of CHARACTERS) {
      this.makeCircleTexture(`char-${c.id}`, 18, c.color, 0xffffff, 2);
    }
    for (const e of ENEMIES) {
      this.makeShapeTexture(`enemy-${e.id}`, e.radius, e.color, e.shape);
    }
    this.makeShapeTexture(`boss-${BOSS_WARDEN.id}`, BOSS_WARDEN.radius, BOSS_WARDEN.color, 'pentagon');

    for (const w of WEAPONS) {
      this.makeCircleTexture(`bullet-${w.id}`, 5, w.color, 0xffffff, 1);
    }
    this.makeCircleTexture('boss-bullet', 6, 0xff80a0, 0xffffff, 1);
    this.makeCircleTexture('xp-gem', 5, 0x5cf7c4, 0xffffff, 1);
    this.makeCircleTexture('coin', 5, 0xffce5d, 0xffffff, 1);

    // Telegraph ring used by the boss AoE.
    const ring = this.add.graphics();
    ring.lineStyle(3, 0xff5d8f, 1);
    ring.strokeCircle(64, 64, 60);
    ring.generateTexture('aoe-telegraph', 128, 128);
    ring.destroy();

    // 1x1 white pixel for tinted rectangles (joystick base, etc.).
    const px = this.add.graphics();
    px.fillStyle(0xffffff, 1);
    px.fillRect(0, 0, 1, 1);
    px.generateTexture('white-pixel', 1, 1);
    px.destroy();

    // Don't auto-start MainScene here - let the registry-aware version handle it
    // this.scene.start('MainScene');
  }

  private makeCircleTexture(key: string, radius: number, fill: number, stroke: number, strokeWidth: number): void {
    const size = radius * 2 + strokeWidth * 2;
    const g = this.add.graphics();
    g.fillStyle(fill, 1);
    g.lineStyle(strokeWidth, stroke, 1);
    g.fillCircle(size / 2, size / 2, radius);
    g.strokeCircle(size / 2, size / 2, radius);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private makeShapeTexture(key: string, radius: number, fill: number, shape: EnemyShape): void {
    const padding = 4;
    const size = radius * 2 + padding * 2;
    const cx = size / 2;
    const cy = size / 2;
    const g = this.add.graphics();
    g.fillStyle(fill, 1);
    g.lineStyle(2, 0xffffff, 1);
    switch (shape) {
      case 'circle':
        g.fillCircle(cx, cy, radius);
        g.strokeCircle(cx, cy, radius);
        break;
      case 'square': {
        const x = cx - radius;
        const y = cy - radius;
        g.fillRect(x, y, radius * 2, radius * 2);
        g.strokeRect(x, y, radius * 2, radius * 2);
        break;
      }
      case 'triangle':
        g.fillTriangle(cx, cy - radius, cx - radius, cy + radius, cx + radius, cy + radius);
        g.strokeTriangle(cx, cy - radius, cx - radius, cy + radius, cx + radius, cy + radius);
        break;
      case 'diamond': {
        const pts = [
          { x: cx, y: cy - radius },
          { x: cx + radius, y: cy },
          { x: cx, y: cy + radius },
          { x: cx - radius, y: cy },
        ];
        g.fillPoints(pts, true);
        g.strokePoints(pts, true);
        break;
      }
      case 'pentagon': {
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < 5; i += 1) {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
          pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
        }
        g.fillPoints(pts, true);
        g.strokePoints(pts, true);
        break;
      }
    }
    g.generateTexture(key, size, size);
    g.destroy();
  }
}
