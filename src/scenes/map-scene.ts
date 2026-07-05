import Phaser from 'phaser';
import { GAME_TITLE, GAME_HEIGHT, TILE_SIZE } from '../config/game-config';
import { GREYBRIDGE_ROWS, GREYBRIDGE_LEGEND } from '../data/greybridge-map';
import { TERRAIN_TYPES } from '../data/terrain-types';
import { createTileMap, getTerrainIdAt } from '../systems/tile-map';

// Renders the Greybridge tile map as coloured grey-box tiles. The courier
// vehicle and gameplay systems are layered on top in later build steps.
export class MapScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MapScene' });
  }

  create(): void {
    const map = createTileMap(GREYBRIDGE_ROWS, GREYBRIDGE_LEGEND);

    // Centre the map vertically within the render area.
    const offsetY = Math.floor((GAME_HEIGHT - map.height * TILE_SIZE) / 2);

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

    this.add.text(8, 8, GAME_TITLE, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#e8e8e8',
    });
  }
}
