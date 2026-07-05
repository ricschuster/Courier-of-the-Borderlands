import { describe, it, expect } from 'vitest';
import { createTileMap, getTerrainIdAt, worldToTile } from '../../src/systems/tile-map';
import { GREYBRIDGE_ROWS, GREYBRIDGE_LEGEND } from '../../src/data/greybridge-map';
import { TERRAIN_TYPES } from '../../src/data/terrain-types';

const LEGEND = { '.': 'plains', '#': 'road' };

describe('createTileMap', () => {
  it('builds a row-major grid with correct dimensions', () => {
    const map = createTileMap(['..#', '#..'], LEGEND);
    expect(map.width).toBe(3);
    expect(map.height).toBe(2);
    expect(map.tiles).toEqual(['plains', 'plains', 'road', 'road', 'plains', 'plains']);
  });

  it('throws on empty input', () => {
    expect(() => createTileMap([], LEGEND)).toThrow(/at least one row/);
  });

  it('throws on ragged rows', () => {
    expect(() => createTileMap(['..#', '#.'], LEGEND)).toThrow(/expected 3/);
  });

  it('throws on a symbol missing from the legend', () => {
    expect(() => createTileMap(['..x'], LEGEND)).toThrow(/symbol 'x'/);
  });
});

describe('getTerrainIdAt', () => {
  const map = createTileMap(['..#', '#..'], LEGEND);

  it('returns the terrain id at a coordinate', () => {
    expect(getTerrainIdAt(map, 2, 0)).toBe('road');
    expect(getTerrainIdAt(map, 0, 1)).toBe('road');
    expect(getTerrainIdAt(map, 0, 0)).toBe('plains');
  });

  it('returns undefined out of bounds', () => {
    expect(getTerrainIdAt(map, -1, 0)).toBeUndefined();
    expect(getTerrainIdAt(map, 3, 0)).toBeUndefined();
    expect(getTerrainIdAt(map, 0, 2)).toBeUndefined();
  });
});

describe('worldToTile', () => {
  it('maps pixel positions to tile coordinates with an origin offset', () => {
    // tile size 48, origin y = 6
    expect(worldToTile(0, 6, 48, 0, 6)).toEqual({ x: 0, y: 0 });
    expect(worldToTile(47, 53, 48, 0, 6)).toEqual({ x: 0, y: 0 });
    expect(worldToTile(48, 54, 48, 0, 6)).toEqual({ x: 1, y: 1 });
    expect(worldToTile(960, 534, 48, 0, 6)).toEqual({ x: 20, y: 11 });
  });
});

describe('Greybridge map data', () => {
  it('is a valid 20x11 map', () => {
    const map = createTileMap(GREYBRIDGE_ROWS, GREYBRIDGE_LEGEND);
    expect(map.width).toBe(20);
    expect(map.height).toBe(11);
    expect(map.tiles).toHaveLength(20 * 11);
  });

  it('maps every legend symbol to a defined terrain type', () => {
    for (const terrainId of Object.values(GREYBRIDGE_LEGEND)) {
      expect(TERRAIN_TYPES[terrainId], `missing terrain: ${terrainId}`).toBeDefined();
    }
  });

  it('has a bridge crossing the river on the road row', () => {
    const map = createTileMap(GREYBRIDGE_ROWS, GREYBRIDGE_LEGEND);
    expect(getTerrainIdAt(map, 9, 5)).toBe('bridge');
    expect(getTerrainIdAt(map, 10, 5)).toBe('bridge');
  });
});
