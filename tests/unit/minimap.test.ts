import { describe, it, expect } from 'vitest';
import {
  buildMinimap,
  surveyWouldShowUnwalked,
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

// #425: the trigger for the one-time teach that names the ring. It takes raw
// state rather than a MinimapModel on purpose, because the minimap is hidden by
// default and its model only exists while it is open; the player who needs the
// teach is the one who never opened it.
describe('surveyWouldShowUnwalked', () => {
  const base = {
    width: 4,
    height: 3,
    courier: { x: 0, y: 0 },
    // Matches makeInput: x in [1,2], y in [0,1] is walked.
    isRevealed: (x: number, y: number) => x >= 1 && x <= 2 && y >= 0 && y <= 1,
  };

  it('is false with no Wayfinder, since there is no ring', () => {
    expect(surveyWouldShowUnwalked({ ...base, surveyRadius: 0 })).toBe(false);
  });

  it('is true once the ring reaches unwalked ground', () => {
    expect(surveyWouldShowUnwalked({ ...base, surveyRadius: 2 })).toBe(true);
  });

  // The case that separates "owns the skill" from "the ring is showing
  // something". Naming the band here would point at an empty map.
  it('is false when everything inside the ring has already been walked', () => {
    expect(
      surveyWouldShowUnwalked({ ...base, surveyRadius: 2, isRevealed: () => true }),
    ).toBe(false);
  });

  // Off-map tiles are not surveyable, matching buildMinimap, where
  // terrainColorAt returns null exactly out of bounds. A 1x1 world with a fully
  // walked single tile has nothing to survey however large the ring is.
  it('does not count tiles off the edge of the map', () => {
    expect(
      surveyWouldShowUnwalked({
        width: 1,
        height: 1,
        courier: { x: 0, y: 0 },
        isRevealed: () => true,
        surveyRadius: 10,
      }),
    ).toBe(false);
  });

  // The predicate has to agree with what the minimap actually draws, or the
  // teach names a band that is not there (or stays silent while one is).
  it('agrees with buildMinimap over the same state', () => {
    for (const surveyRadius of [0, 1, 2, 5]) {
      const model = buildMinimap(makeInput({ ...base, surveyRadius }));
      expect(
        surveyWouldShowUnwalked({ ...base, surveyRadius }),
        `radius ${surveyRadius}`,
      ).toBe(model.cells.some((c) => c.surveyed));
    }
  });
});

describe('wayfinderSurveyRadius', () => {
  it('is 0 without Wayfinder so only a Wayfinder surveys', () => {
    expect(wayfinderSurveyRadius(0, 9)).toBe(0);
  });

  it('grows a fixed margin per rank beyond the fog', () => {
    expect(wayfinderSurveyRadius(1, 6)).toBe(6 + SURVEY_TILES_PER_WAYFINDER_RANK);
    expect(wayfinderSurveyRadius(3, 6)).toBe(6 + 3 * SURVEY_TILES_PER_WAYFINDER_RANK);
  });

  // The #361 regression guard, and the whole point of the change. The ring was
  // an absolute radius, which put it *inside* the walked fog at every rank for a
  // courier with the reveal upgrades fitted, so it could not show a single tile
  // the player could not already see. Measured at 0 of 69 routes changed.
  it('always reaches past the fog, at every rank and every reveal radius', () => {
    for (const reveal of [2.5, 3.5, 5.5, 6, 9, 12]) {
      for (const rank of [1, 2, 3]) {
        expect(
          wayfinderSurveyRadius(rank, reveal),
          `rank ${rank} at reveal ${reveal} does not clear the fog`,
        ).toBeGreaterThan(reveal);
      }
    }
  });

  it('shrinks with the fog when bad weather pulls sight in', () => {
    expect(wayfinderSurveyRadius(2, 3)).toBeLessThan(wayfinderSurveyRadius(2, 8));
  });

  it('treats a negative rank as no survey', () => {
    expect(wayfinderSurveyRadius(-2, 9)).toBe(0);
  });

  it('never returns a negative radius on a nonsensical reveal', () => {
    expect(wayfinderSurveyRadius(1, -5)).toBe(SURVEY_TILES_PER_WAYFINDER_RANK);
  });
});
