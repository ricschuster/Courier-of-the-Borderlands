import Phaser from 'phaser';
import { COURIER_SIZE, WAGON_TEXTURE_KEY } from '../config/game-config';

// The courier wagon: a small covered-wagon sprite with an arcade physics body so
// it moves smoothly and stays inside the world bounds. Displaying at COURIER_SIZE
// keeps the physics body the same size the grey-box square used, so collision and
// gap-fitting are unchanged. The wagon art faces "up" (its gold driver bench at
// the top), so it is rotated to point along the direction of travel.
export class Courier {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly body: Phaser.Physics.Arcade.Body;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.add
      .image(x, y, WAGON_TEXTURE_KEY)
      .setDisplaySize(COURIER_SIZE, COURIER_SIZE);
    scene.physics.add.existing(this.sprite);
    this.body = this.sprite.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
  }

  setVelocity(x: number, y: number): void {
    this.body.setVelocity(x, y);
    // Face the direction of travel while moving; hold the last heading when
    // stopped. The body stays axis-aligned (arcade bodies do not rotate), so
    // collision is unaffected by the sprite's rotation.
    if (x !== 0 || y !== 0) {
      this.sprite.setRotation(Math.atan2(y, x) + Math.PI / 2);
    }
  }
}
