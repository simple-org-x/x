import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MainScene } from './scenes/MainScene';
import { useAppStore } from '@/state/store';
import type { GameEvents } from './events';

export default function PhaserGame() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const characterId = useAppStore((s) => s.selectedCharacter);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const events: GameEvents = {
      hudUpdate: (h) => useAppStore.getState().setHud(h),
      bossSpawn: () => useAppStore.getState().setBossActive(true),
      levelUp: (cards, resolve) => {
        useAppStore.getState().openUpgradePicker(cards, resolve);
      },
      gameOver: (summary) => useAppStore.getState().finishRun(summary),
      victory: (summary) => useAppStore.getState().finishRun(summary),
    };

    // BootScene reads characterId/events from the global registry then
    // forwards them to MainScene via scene.start data.
    const RegistryAwareBoot = class extends BootScene {
      override create(): void {
        super.create();
        // BootScene's super.create() already started MainScene with no
        // payload; stop it and restart with the data we need.
        this.scene.stop('MainScene');
        this.scene.start('MainScene', {
          characterId: this.registry.get('characterId'),
          events: this.registry.get('events'),
        });
      }
    };

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      backgroundColor: '#0b0d12',
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: '100%',
        height: '100%',
      },
      physics: {
        default: 'arcade',
        arcade: { debug: false, gravity: { x: 0, y: 0 } },
      },
      scene: [RegistryAwareBoot, MainScene],
      banner: false,
    });

    game.registry.set('characterId', characterId);
    game.registry.set('events', events);

    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [characterId]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
