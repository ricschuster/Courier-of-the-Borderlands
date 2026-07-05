// Entry point for Courier of the Borderlands.
// Boots the Phaser game and mounts it into the #game element.
import Phaser from 'phaser';
import { BootScene } from './scenes/boot-scene';
import { MapScene } from './scenes/map-scene';
import { GAME_TITLE, GAME_WIDTH, GAME_HEIGHT, BACKGROUND_COLOR } from './config/game-config';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  title: GAME_TITLE,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: BACKGROUND_COLOR,
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MapScene],
};

new Phaser.Game(config);
