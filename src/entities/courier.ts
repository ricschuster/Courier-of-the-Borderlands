import Phaser from 'phaser';
import { COURIER_SIZE, COURIER_COLOR } from '../config/game-config';

// The courier wagon. A grey-box rectangle with an arcade physics body so it
// can move smoothly and be kept inside the world bounds. Later steps layer
// terrain speed effects and upgrades on top.
export class Courier {
  readonly sprite: Phaser.GameObjects.Rectangle;
  private readonly body: Phaser.Physics.Arcade.Body;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.add.rectangle(x, y, COURIER_SIZE, COURIER_SIZE, COURIER_COLOR);
    scene.physics.add.existing(this.sprite);
    this.body = this.sprite.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
  }

  setVelocity(x: number, y: number): void {
    this.body.setVelocity(x, y);
  }
}
