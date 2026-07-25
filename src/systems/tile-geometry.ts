// Pure tile-to-pixel geometry. No Phaser here, so the arithmetic that positions
// everything on the map is unit testable on its own.
//
// Separate from tile-map.ts on purpose: that module is about the grid (what
// terrain is at a coordinate), this one is about where a grid coordinate lands
// on screen. The two were the same three lines repeated in the scene before
// #365.

import { TILE_SIZE } from '../config/game-config';

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Centre of a tile in world pixels.
 *
 * `originY` is the map's vertical offset in the world. The map is currently
 * drawn at the world origin (0), but the offset has always been threaded through
 * this calculation, and every drawn thing has to agree on it or the terrain,
 * colliders, fog, and markers drift apart by a fixed number of pixels.
 */
export function tileCenter(tileX: number, tileY: number, originY: number): PixelPoint {
  return {
    x: tileX * TILE_SIZE + TILE_SIZE / 2,
    y: originY + tileY * TILE_SIZE + TILE_SIZE / 2,
  };
}
