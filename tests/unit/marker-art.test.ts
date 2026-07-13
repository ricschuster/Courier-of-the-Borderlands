import { describe, it, expect } from 'vitest';
import {
  HOUSE_VARIANTS,
  houseForIndex,
  SIGNPOST_FRAME,
  MARKER_ATLAS_COLUMNS,
  MARKER_ATLAS_ROWS,
  MARKER_ATLAS_FRAME_CONFIG,
} from '../../src/data/marker-art';

const FRAME_COUNT = MARKER_ATLAS_COLUMNS * MARKER_ATLAS_ROWS;

function inRange(frame: number): boolean {
  return Number.isInteger(frame) && frame >= 0 && frame < FRAME_COUNT;
}

describe('marker art frames are within the atlas', () => {
  it('has in-range house frames', () => {
    for (const house of HOUSE_VARIANTS) {
      expect(inRange(house.roof), `roof frame ${house.roof} out of range`).toBe(true);
      expect(inRange(house.wall), `wall frame ${house.wall} out of range`).toBe(true);
    }
  });

  it('has an in-range signpost frame', () => {
    expect(inRange(SIGNPOST_FRAME)).toBe(true);
  });
});

describe('houseForIndex', () => {
  it('is stable and cycles through the variants', () => {
    expect(houseForIndex(0)).toEqual(HOUSE_VARIANTS[0]);
    expect(houseForIndex(1)).toEqual(HOUSE_VARIANTS[1 % HOUSE_VARIANTS.length]);
    // Same index always returns the same house, so a place never flickers style.
    expect(houseForIndex(4)).toEqual(houseForIndex(4));
    // Wraps around the variant list.
    expect(houseForIndex(HOUSE_VARIANTS.length)).toEqual(HOUSE_VARIANTS[0]);
  });

  it('always returns a defined house for any non-negative index', () => {
    for (let i = 0; i < 20; i++) {
      expect(houseForIndex(i)).toBeDefined();
    }
  });
});

describe('atlas config', () => {
  it('describes 16px packed tiles (no spacing)', () => {
    expect(MARKER_ATLAS_FRAME_CONFIG.frameWidth).toBe(16);
    expect(MARKER_ATLAS_FRAME_CONFIG.frameHeight).toBe(16);
    expect(HOUSE_VARIANTS.length).toBeGreaterThan(0);
  });
});
