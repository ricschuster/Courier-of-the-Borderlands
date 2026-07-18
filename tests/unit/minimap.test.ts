import { describe, it, expect } from 'vitest';
import {
  buildMinimap,
  wayfinderSurveyRadius,
  SURVEY_TILES_PER_WAYFINDER_RANK,
} from '../../src/systems/minimap';
import type { MinimapInput } from '../../src/systems/minimap';

// Helpers ------------------------------------------------------------------

const FIXED_COLOR = 0x336699;

/** Build a small input where a rectangle of tiles is revealed. */
function makeInput(overrides: Partial<MinimapInput> = {}): MinimapInput {
  // 4 x 3 grid; tiles with x in [1,2] and y in [0,1] are revealed.
  const revealedRect = (x: number, y: number): boolean =>
    x >= 1 && x <= 2 && y >= 0 && y <= 1;

  return {
    width: 4,
    height: 3,
    isRevealed: revealedRect,
    terrainColorAt: (x, y) =>
      x >= 0 && x < 4 && y >= 0 && y < 3 ? FIXED_COLOR : null,
    courier: { x: 0, y: 0 },
    settlements: [],
    ...overrides,
  };
}

/** Index into a row-major cells array. */
function idx(input: MinimapInput, x: number, y: number): number {
  return y * input.width + x;
}

// Tests --------------------------------------------------------------------

describe('buildMinimap', () => {
  it('returns correct dimensions', () => {
    const input = makeInput();
    const model = buildMinimap(input);
    expect(model.width).toBe(4);
    expect(model.height).toBe(3);
    expect(model.cells.length).toBe(4 * 3);
  });

  it('stores cells in row-major order (y then x)', () => {
    const input = makeInput();
    const model = buildMinimap(input);

    // Cell at (x=2, y=1) should sit at index y*width + x = 1*4 + 2 = 6.
    const cell = model.cells[6];
    // That tile is inside the revealed rectangle, so color should be set.
    expect(cell).toBeDefined();
    expect(cell!.revealed).toBe(true);
  });

  it('revealed cell carries terrain colour', () => {
    const input = makeInput();
    const model = buildMinimap(input);

    const cell = model.cells[idx(input, 1, 0)]; // (1,0) is revealed
    expect(cell!.revealed).toBe(true);
    expect(cell!.color).toBe(FIXED_COLOR);
  });

  it('fogged cell has color null', () => {
    const input = makeInput();
    const model = buildMinimap(input);

    const cell = model.cells[idx(input, 0, 2)]; // (0,2) is not in the revealed rect
    expect(cell!.revealed).toBe(false);
    expect(cell!.color).toBeNull();
  });

  it('courier marker appears at the courier tile', () => {
    const input = makeInput({ courier: { x: 2, y: 1 } });
    const model = buildMinimap(input);

    const cell = model.cells[idx(input, 2, 1)];
    expect(cell!.marker).toBe('courier');
  });

  it('settlement marker appears when that tile is revealed', () => {
    const input = makeInput({
      settlements: [{ x: 1, y: 0 }], // (1,0) is inside the revealed rect
    });
    const model = buildMinimap(input);

    const cell = model.cells[idx(input, 1, 0)];
    expect(cell!.marker).toBe('settlement');
  });

  it('settlement marker absent when that tile is fogged', () => {
    const input = makeInput({
      settlements: [{ x: 3, y: 2 }], // (3,2) is outside the revealed rect
    });
    const model = buildMinimap(input);

    const cell = model.cells[idx(input, 3, 2)];
    expect(cell!.marker).toBeNull();
  });

  it('carries a revealed settlement status onto its cell', () => {
    const input = makeInput({
      settlements: [{ x: 1, y: 0, status: 'reconnected' }], // (1,0) is revealed
    });
    const model = buildMinimap(input);

    const cell = model.cells[idx(input, 1, 0)];
    expect(cell!.marker).toBe('settlement');
    expect(cell!.settlementStatus).toBe('reconnected');
  });

  it('leaves settlementStatus null on non-settlement cells', () => {
    const input = makeInput({ settlements: [{ x: 1, y: 0, status: 'silent' }] });
    const model = buildMinimap(input);

    const empty = model.cells[idx(input, 2, 0)]; // revealed, no settlement
    expect(empty!.marker).toBeNull();
    expect(empty!.settlementStatus).toBeNull();
  });

  it('courier takes precedence over settlement on the same tile', () => {
    // Put courier and settlement on the same revealed tile.
    const input = makeInput({
      courier: { x: 1, y: 0 },
      settlements: [{ x: 1, y: 0 }],
    });
    const model = buildMinimap(input);

    const cell = model.cells[idx(input, 1, 0)];
    expect(cell!.marker).toBe('courier');
  });

  it('courier marker is set even on an unrevealed tile', () => {
    // Courier is on a fogged tile; it should still get the marker.
    const input = makeInput({ courier: { x: 0, y: 2 } }); // (0,2) is fogged
    const model = buildMinimap(input);

    const cell = model.cells[idx(input, 0, 2)];
    expect(cell!.revealed).toBe(false);
    expect(cell!.marker).toBe('courier');
  });

  it('tiles with no marker return null', () => {
    const input = makeInput({ courier: { x: 3, y: 2 } });
    const model = buildMinimap(input);

    // (0,0) is fogged, no courier, no settlement.
    const cell = model.cells[idx(input, 0, 0)];
    expect(cell!.marker).toBeNull();
  });

  describe('Wayfinder survey ring (#324)', () => {
    it('shows unwalked terrain within the survey radius of the courier', () => {
      // Courier at (0,0), radius 2. (0,2) is fogged but 2 tiles away, so it is
      // surveyed: terrain shows, but it is not counted as revealed.
      const input = makeInput({ courier: { x: 0, y: 0 }, surveyRadius: 2 });
      const model = buildMinimap(input);

      const cell = model.cells[idx(input, 0, 2)];
      expect(cell!.revealed).toBe(false);
      expect(cell!.surveyed).toBe(true);
      expect(cell!.color).toBe(FIXED_COLOR);
    });

    it('leaves fogged terrain beyond the survey radius unsurveyed', () => {
      // (3,2) is ~3.6 tiles from (0,0), outside radius 2.
      const input = makeInput({ courier: { x: 0, y: 0 }, surveyRadius: 2 });
      const model = buildMinimap(input);

      const cell = model.cells[idx(input, 3, 2)];
      expect(cell!.surveyed).toBe(false);
      expect(cell!.color).toBeNull();
    });

    it('never marks a walked (revealed) tile as merely surveyed', () => {
      // (1,0) is revealed and within radius; it stays revealed, not surveyed.
      const input = makeInput({ courier: { x: 0, y: 0 }, surveyRadius: 2 });
      const model = buildMinimap(input);

      const cell = model.cells[idx(input, 1, 0)];
      expect(cell!.revealed).toBe(true);
      expect(cell!.surveyed).toBe(false);
    });

    it('does not reveal a settlement identity on a surveyed-only tile', () => {
      // Settlement on a fogged tile inside the survey ring: terrain shows, but
      // no settlement marker (the survey is terrain shape, not place identity).
      const input = makeInput({
        courier: { x: 0, y: 0 },
        surveyRadius: 2,
        settlements: [{ x: 0, y: 2 }],
      });
      const model = buildMinimap(input);

      const cell = model.cells[idx(input, 0, 2)];
      expect(cell!.surveyed).toBe(true);
      expect(cell!.marker).toBeNull();
    });

    it('disables the survey with radius 0 (no Wayfinder)', () => {
      const input = makeInput({ courier: { x: 0, y: 0 }, surveyRadius: 0 });
      const model = buildMinimap(input);

      const cell = model.cells[idx(input, 0, 2)];
      expect(cell!.surveyed).toBe(false);
      expect(cell!.color).toBeNull();
    });
  });
});

describe('wayfinderSurveyRadius', () => {
  it('is 0 without Wayfinder so only a Wayfinder surveys', () => {
    expect(wayfinderSurveyRadius(0)).toBe(0);
  });

  it('grows a fixed number of tiles per rank', () => {
    expect(wayfinderSurveyRadius(1)).toBe(SURVEY_TILES_PER_WAYFINDER_RANK);
    expect(wayfinderSurveyRadius(3)).toBe(3 * SURVEY_TILES_PER_WAYFINDER_RANK);
  });

  it('treats a negative rank as no survey', () => {
    expect(wayfinderSurveyRadius(-2)).toBe(0);
  });
});
