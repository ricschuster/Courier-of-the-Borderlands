import { describe, it, expect } from 'vitest';
import {
  TERRAIN_ART,
  terrainArt,
  terrainTileArt,
  type TerrainArt,
  TERRAIN_ATLAS_COLUMNS,
  TERRAIN_ATLAS_ROWS,
  TERRAIN_ATLAS_FRAME_CONFIG,
} from '../../src/data/terrain-art';
import { TERRAIN_TYPES } from '../../src/data/terrain-types';

const FRAME_COUNT = TERRAIN_ATLAS_COLUMNS * TERRAIN_ATLAS_ROWS;

// Every frame a terrain can ever draw: the base and overlay plus their variants,
// so the in-range guard covers the variety pool (#209), not just the defaults.
function framesOf(art: TerrainArt): number[] {
  return [
    art.base,
    ...(art.baseVariants ?? []),
    ...(art.overlay === undefined ? [] : [art.overlay]),
    ...(art.overlayVariants ?? []),
  ];
}

describe('terrain art covers every terrain', () => {
  // A missing entry silently falls back to grey-box, so this guards that the
  // skin stays complete as terrain types are added.
  it.each(Object.keys(TERRAIN_TYPES))('%s has an art entry', (id) => {
    expect(terrainArt(id), `terrain ${id} has no atlas frames`).toBeDefined();
  });
});

describe('terrain art frames are within the atlas', () => {
  it.each(Object.entries(TERRAIN_ART))('%s frames are in range', (id, art) => {
    for (const frame of framesOf(art)) {
      expect(
        Number.isInteger(frame) && frame >= 0 && frame < FRAME_COUNT,
        `terrain ${id} frame ${frame} is outside 0..${FRAME_COUNT - 1}`,
      ).toBe(true);
    }
  });
});

describe('terrainArt lookup', () => {
  it('returns undefined for an unknown terrain so the caller falls back', () => {
    expect(terrainArt('no-such-terrain')).toBeUndefined();
  });

  it('never maps a terrain to an art entry for a terrain that does not exist', () => {
    for (const id of Object.keys(TERRAIN_ART)) {
      expect(TERRAIN_TYPES[id], `art references unknown terrain ${id}`).toBeDefined();
    }
  });
});

describe('terrainTileArt per-tile variety (#209)', () => {
  it('is deterministic: the same tile always resolves the same art', () => {
    for (let i = 0; i < 20; i++) {
      const a = terrainTileArt('plains', i, i * 2);
      const b = terrainTileArt('plains', i, i * 2);
      expect(a).toEqual(b);
    }
  });

  it('only ever picks frames from the terrain declared pool', () => {
    for (const [id, art] of Object.entries(TERRAIN_ART)) {
      const basePool = new Set([art.base, ...(art.baseVariants ?? [])]);
      const overlayPool =
        art.overlay === undefined
          ? undefined
          : new Set([art.overlay, ...(art.overlayVariants ?? [])]);
      for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 12; x++) {
          const tile = terrainTileArt(id, x, y);
          expect(tile, `${id} at ${x},${y}`).toBeDefined();
          expect(basePool.has(tile!.base), `${id} base ${tile!.base}`).toBe(true);
          if (overlayPool === undefined) {
            expect(tile!.overlay).toBeUndefined();
          } else {
            expect(overlayPool.has(tile!.overlay!), `${id} overlay ${tile!.overlay}`).toBe(true);
          }
        }
      }
    }
  });

  it('actually varies a multi-frame terrain across a field', () => {
    // Plains has three ground frames; a 16x16 field must use more than one, or the
    // variety is not landing (the whole point of the slice).
    const seen = new Set<number>();
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        seen.add(terrainTileArt('plains', x, y)!.base);
      }
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('flips some but not all tiles of a flip-enabled terrain', () => {
    let flipped = 0;
    let total = 0;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        total++;
        if (terrainTileArt('water', x, y)!.flipX) {
          flipped++;
        }
      }
    }
    expect(flipped).toBeGreaterThan(0);
    expect(flipped).toBeLessThan(total);
  });

  it('never flips a directional terrain (roads stay oriented)', () => {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        expect(terrainTileArt('road', x, y)!.flipX).toBe(false);
        expect(terrainTileArt('bridge', x, y)!.flipX).toBe(false);
      }
    }
  });

  it('returns undefined for an unknown terrain so the caller falls back', () => {
    expect(terrainTileArt('no-such-terrain', 0, 0)).toBeUndefined();
  });
});

describe('atlas frame config is consistent', () => {
  it('describes 16px tiles with 1px spacing', () => {
    expect(TERRAIN_ATLAS_FRAME_CONFIG.frameWidth).toBe(16);
    expect(TERRAIN_ATLAS_FRAME_CONFIG.frameHeight).toBe(16);
    expect(TERRAIN_ATLAS_FRAME_CONFIG.spacing).toBe(1);
    expect(TERRAIN_ATLAS_FRAME_CONFIG.margin).toBe(0);
  });
});
