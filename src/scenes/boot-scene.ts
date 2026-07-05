import Phaser from 'phaser';
import { GAME_TITLE, GAME_WIDTH, GAME_HEIGHT } from '../config/game-config';

// M0 walking skeleton scene. Confirms Phaser boots and renders. It draws a
// title and a placeholder line so we can see the canvas is alive. Gameplay
// scenes (map, movement, fog-of-war) replace this in later milestones.
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, GAME_TITLE, {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#e8e8e8',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 24, 'M0 walking skeleton', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#8a8a8a',
      })
      .setOrigin(0.5);
  }
}
