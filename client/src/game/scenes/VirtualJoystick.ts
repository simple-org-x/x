import Phaser from 'phaser';

/**
 * Lightweight virtual joystick. Two concentric circles fixed in screen
 * space at the bottom-left. Drag the inner stick to set a normalized
 * direction vector; release to zero it out. Activates only on touch
 * pointers so desktop play never sees it.
 */
export class VirtualJoystick {
  private base: Phaser.GameObjects.Graphics;
  private stick: Phaser.GameObjects.Graphics;
  private baseX = 90;
  private baseY = 0;
  private radius = 60;
  private active = false;
  private pointerId: number | null = null;
  public dirX = 0;
  public dirY = 0;

  constructor(private scene: Phaser.Scene) {
    this.base = scene.add.graphics().setScrollFactor(0).setDepth(1000).setAlpha(0.35);
    this.stick = scene.add.graphics().setScrollFactor(0).setDepth(1001).setAlpha(0.65);
    this.layout();
    this.draw();
    scene.scale.on('resize', this.layout, this);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  private layout(): void {
    const cam = this.scene.cameras.main;
    this.baseX = 90;
    this.baseY = cam.height - 90;
    this.draw();
  }

  private draw(): void {
    this.base.clear();
    this.base.lineStyle(2, 0xffffff, 0.6);
    this.base.fillStyle(0x000000, 0.25);
    this.base.fillCircle(this.baseX, this.baseY, this.radius);
    this.base.strokeCircle(this.baseX, this.baseY, this.radius);

    this.stick.clear();
    const sx = this.baseX + this.dirX * this.radius;
    const sy = this.baseY + this.dirY * this.radius;
    this.stick.fillStyle(0xffffff, 0.85);
    this.stick.fillCircle(sx, sy, 22);
  }

  private isTouchPointer(p: Phaser.Input.Pointer): boolean {
    // wasTouch is true for synthetic touch events; pointerType 'touch' covers PointerEvent.
    return p.wasTouch || (p as unknown as { pointerType?: string }).pointerType === 'touch';
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.active) return;
    if (!this.isTouchPointer(p)) return;
    const dx = p.x - this.baseX;
    const dy = p.y - this.baseY;
    if (Math.hypot(dx, dy) > this.radius * 1.5) return;
    this.active = true;
    this.pointerId = p.id;
    this.update(p);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.active || p.id !== this.pointerId) return;
    this.update(p);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (!this.active || p.id !== this.pointerId) return;
    this.active = false;
    this.pointerId = null;
    this.dirX = 0;
    this.dirY = 0;
    this.draw();
  }

  private update(p: Phaser.Input.Pointer): void {
    const dx = p.x - this.baseX;
    const dy = p.y - this.baseY;
    const len = Math.hypot(dx, dy);
    if (len <= this.radius) {
      this.dirX = dx / this.radius;
      this.dirY = dy / this.radius;
    } else {
      this.dirX = dx / len;
      this.dirY = dy / len;
    }
    this.draw();
  }

  destroy(): void {
    this.base.destroy();
    this.stick.destroy();
    this.scene.scale.off('resize', this.layout, this);
  }
}
