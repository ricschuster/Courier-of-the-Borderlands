import Phaser from 'phaser';

// Boot scene: the entry scene for the game. Later this will preload assets;
// for now it immediately hands off to the map scene.
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    this.scene.start('MapScene');
  }
}
