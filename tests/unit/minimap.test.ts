import { describe, it, expect } from 'vitest';
import { buildMinimap } from '../../src/systems/minimap';
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
});
