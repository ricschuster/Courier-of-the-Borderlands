import Phaser from 'phaser';
import { GAME_TITLE, GAME_HEIGHT, TILE_SIZE, COURIER_SPEED } from '../config/game-config';
import { GREYBRIDGE_ROWS, GREYBRIDGE_LEGEND } from '../data/greybridge-map';
import { TERRAIN_TYPES } from '../data/terrain-types';
import { createTileMap, getTerrainIdAt, worldToTile, type TileMap } from '../systems/tile-map';
import { getTerrain, getSpeedModifier, isPassable } from '../systems/terrain-system';
import { computeVelocity, type MoveInput } from '../systems/movement';
import { Courier } from '../entities/courier';

interface WasdKeys {
  readonly W: Phaser.Input.Keyboard.Key;
  readonly A: Phaser.Input.Keyboard.Key;
  readonly S: Phaser.Input.Keyboard.Key;
  readonly D: Phaser.Input.Keyboard.Key;
}

// Renders the Greybridge tile map and lets the player drive the courier around
// it. Roads and the bridge are faster, forest is slower, and water and
// mountains are impassable (blocked by colliders), so the river can only be
// crossed at the bridge.
export class MapScene extends Phaser.Scene {
  private map!: TileMap;
  private mapOriginY = 0;
  private courier!: Courier;
  private impassable!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WasdKeys;
  private terrainReadout!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'MapScene' });
  }

  create(): void {
    this.map = createTileMap(GREYBRIDGE_ROWS, GREYBRIDGE_LEGEND);

    // Centre the map vertically within the render area.
    this.mapOriginY = Math.floor((GAME_HEIGHT - this.map.height * TILE_SIZE) / 2);

    this.drawTiles();
    this.addImpassableColliders();

    // Keep the courier inside the map area.
    this.physics.world.setBounds(
      0,
      this.mapOriginY,
      this.map.width * TILE_SIZE,
      this.map.height * TILE_SIZE,
    );

    // Spawn on the road at the left edge of the bridge row (y = 5).
    const spawnX = TILE_SIZE * 1.5;
    const spawnY = this.mapOriginY + 5 * TILE_SIZE + TILE_SIZE / 2;
    this.courier = new Courier(this, spawnX, spawnY);
    this.physics.add.collider(this.courier.sprite, this.impassable);

    this.setupInput();
    this.addHud();
  }

  update(): void {
    const input: MoveInput = {
      up: this.cursors.up.isDown || this.wasd.W.isDown,
      down: this.cursors.down.isDown || this.wasd.S.isDown,
      left: this.cursors.left.isDown || this.wasd.A.isDown,
      right: this.cursors.right.isDown || this.wasd.D.isDown,
    };

    const terrainId = this.terrainUnderCourier();
    const modifier = terrainId === undefined ? 1 : getSpeedModifier(terrainId);
    const velocity = computeVelocity(input, COURIER_SPEED * modifier);
    this.courier.setVelocity(velocity.x, velocity.y);

    const terrain = terrainId === undefined ? undefined : getTerrain(terrainId);
    this.terrainReadout.setText(
      terrain === undefined
        ? 'Terrain: unknown'
        : `Terrain: ${terrain.name} (${terrain.speedModifier.toFixed(2)}x)`,
    );
  }

  private terrainUnderCourier(): string | undefined {
    const tile = worldToTile(
      this.courier.sprite.x,
      this.courier.sprite.y,
      TILE_SIZE,
      0,
      this.mapOriginY,
    );
    return getTerrainIdAt(this.map, tile.x, tile.y);
  }

  private drawTiles(): void {
    const tiles = this.add.graphics();
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const terrainId = getTerrainIdAt(this.map, x, y);
        if (terrainId === undefined) {
          continue;
        }
        const terrain = TERRAIN_TYPES[terrainId];
        if (terrain === undefined) {
          continue;
        }
        tiles.fillStyle(terrain.color, 1);
        tiles.fillRect(x * TILE_SIZE, this.mapOriginY + y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  private addImpassableColliders(): void {
    this.impassable = this.physics.add.staticGroup();
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const terrainId = getTerrainIdAt(this.map, x, y);
        if (terrainId === undefined || isPassable(terrainId)) {
          continue;
        }
        const block = this.add.rectangle(
          x * TILE_SIZE + TILE_SIZE / 2,
          this.mapOriginY + y * TILE_SIZE + TILE_SIZE / 2,
          TILE_SIZE,
          TILE_SIZE,
        );
        this.impassable.add(block);
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

  private addHud(): void {
    this.add.text(8, 8, GAME_TITLE, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#e8e8e8',
    });
    this.terrainReadout = this.add.text(8, 26, 'Terrain: unknown', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#e8e8e8',
    });
    this.add.text(8, GAME_HEIGHT - 22, 'Arrow keys or WASD to drive', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#8a8a8a',
    });
  }
}
