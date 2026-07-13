import { describe, it, expect } from 'vitest';
import {
  TERRAIN_ART,
  terrainArt,
  TERRAIN_ATLAS_COLUMNS,
  TERRAIN_ATLAS_ROWS,
  TERRAIN_ATLAS_FRAME_CONFIG,
} from '../../src/data/terrain-art';
import { TERRAIN_TYPES } from '../../src/data/terrain-types';

const FRAME_COUNT = TERRAIN_ATLAS_COLUMNS * TERRAIN_ATLAS_ROWS;

function framesOf(art: { base: number; overlay?: number }): number[] {
  return art.overlay === undefined ? [art.base] : [art.base, art.overlay];
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

describe('atlas frame config is consistent', () => {
  it('describes 16px tiles with 1px spacing', () => {
    expect(TERRAIN_ATLAS_FRAME_CONFIG.frameWidth).toBe(16);
    expect(TERRAIN_ATLAS_FRAME_CONFIG.frameHeight).toBe(16);
    expect(TERRAIN_ATLAS_FRAME_CONFIG.spacing).toBe(1);
    expect(TERRAIN_ATLAS_FRAME_CONFIG.margin).toBe(0);
  });
});
