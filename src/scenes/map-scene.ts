import Phaser from 'phaser';
import { GAME_TITLE, GAME_HEIGHT, TILE_SIZE, COURIER_SPEED } from '../config/game-config';
import { GREYBRIDGE_ROWS, GREYBRIDGE_LEGEND } from '../data/greybridge-map';
import { TERRAIN_TYPES } from '../data/terrain-types';
import { createTileMap, getTerrainIdAt, type TileMap } from '../systems/tile-map';
import { computeVelocity, type MoveInput } from '../systems/movement';
import { Courier } from '../entities/courier';

interface WasdKeys {
  readonly W: Phaser.Input.Keyboard.Key;
  readonly A: Phaser.Input.Keyboard.Key;
  readonly S: Phaser.Input.Keyboard.Key;
  readonly D: Phaser.Input.Keyboard.Key;
}

// Renders the Greybridge tile map and lets the player drive the courier around
// it with the arrow keys or WASD. Terrain movement effects arrive next.
export class MapScene extends Phaser.Scene {
  private courier!: Courier;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WasdKeys;

  constructor() {
    super({ key: 'MapScene' });
  }

  create(): void {
    const map = createTileMap(GREYBRIDGE_ROWS, GREYBRIDGE_LEGEND);

    // Centre the map vertically within the render area.
    const offsetY = Math.floor((GAME_HEIGHT - map.height * TILE_SIZE) / 2);

    this.drawTiles(map, offsetY);

    // Keep the courier inside the map area.
    this.physics.world.setBounds(0, offsetY, map.width * TILE_SIZE, map.height * TILE_SIZE);

    // Spawn on the road at the left edge of the bridge row (y = 5).
    const spawnX = TILE_SIZE * 1.5;
    const spawnY = offsetY + 5 * TILE_SIZE + TILE_SIZE / 2;
    this.courier = new Courier(this, spawnX, spawnY);

    this.setupInput();

    this.add.text(8, 8, GAME_TITLE, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#e8e8e8',
    });
    this.add.text(8, GAME_HEIGHT - 22, 'Arrow keys or WASD to drive', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#8a8a8a',
    });
  }

  update(): void {
    const input: MoveInput = {
      up: this.cursors.up.isDown || this.wasd.W.isDown,
      down: this.cursors.down.isDown || this.wasd.S.isDown,
      left: this.cursors.left.isDown || this.wasd.A.isDown,
      right: this.cursors.right.isDown || this.wasd.D.isDown,
    };
    const velocity = computeVelocity(input, COURIER_SPEED);
    this.courier.setVelocity(velocity.x, velocity.y);
  }

  private drawTiles(map: TileMap, offsetY: number): void {
    const tiles = this.add.graphics();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const terrainId = getTerrainIdAt(map, x, y);
        if (terrainId === undefined) {
          continue;
        }
        const terrain = TERRAIN_TYPES[terrainId];
        if (terrain === undefined) {
          continue;
        }
        tiles.fillStyle(terrain.color, 1);
        tiles.fillRect(x * TILE_SIZE, offsetY + y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) {
      throw new Error('keyboard input is not available');
    }
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys('W,A,S,D') as WasdKeys;
  }
}
