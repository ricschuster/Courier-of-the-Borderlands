import { describe, it, expect } from 'vitest';
import { TILE_SIZE } from '../../src/config/game-config';
import { tileCenter } from '../../src/systems/tile-geometry';

// #365. This arithmetic was inline in MapScene, where nothing could test it, and
// it decides where terrain, colliders, fog, and the spawn point all land. Every
// drawn thing has to agree on it: an off-by-half-a-tile here puts the wagon
// inside a collider.
describe('tileCenter', () => {
  it('centres the origin tile at half a tile in', () => {
    expect(tileCenter(0, 0, 0)).toEqual({ x: TILE_SIZE / 2, y: TILE_SIZE / 2 });
  });

  it('advances one tile width per column and height per row', () => {
    expect(tileCenter(3, 2, 0)).toEqual({
      x: 3 * TILE_SIZE + TILE_SIZE / 2,
      y: 2 * TILE_SIZE + TILE_SIZE / 2,
    });
  });

  it('offsets only the vertical axis by originY', () => {
    const at = tileCenter(4, 1, 120);
    const flat = tileCenter(4, 1, 0);
    expect(at.x).toBe(flat.x);
    expect(at.y).toBe(flat.y + 120);
  });

  // A tile centre must sit strictly inside its own tile, never on the boundary,
  // or the courier can be spawned exactly on a collider edge.
  it('lands strictly inside the tile bounds', () => {
    const { x, y } = tileCenter(7, 5, 0);
    expect(x).toBeGreaterThan(7 * TILE_SIZE);
    expect(x).toBeLessThan(8 * TILE_SIZE);
    expect(y).toBeGreaterThan(5 * TILE_SIZE);
    expect(y).toBeLessThan(6 * TILE_SIZE);
  });
});
