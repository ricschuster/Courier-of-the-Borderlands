import { describe, it, expect } from 'vitest';
import { bearingLabel } from '../../src/systems/bearing';

// Tile space is screen-space: +x east, +y south. North is a smaller y.
describe('bearingLabel', () => {
  const from = { x: 5, y: 5 };

  it('returns null for the same tile', () => {
    expect(bearingLabel(from, { x: 5, y: 5 })).toBeNull();
  });

  it('reads the four cardinals', () => {
    expect(bearingLabel(from, { x: 5, y: 0 })).toBe('N');
    expect(bearingLabel(from, { x: 9, y: 5 })).toBe('E');
    expect(bearingLabel(from, { x: 5, y: 9 })).toBe('S');
    expect(bearingLabel(from, { x: 0, y: 5 })).toBe('W');
  });

  it('reads the four intercardinals', () => {
    expect(bearingLabel(from, { x: 9, y: 1 })).toBe('NE');
    expect(bearingLabel(from, { x: 9, y: 9 })).toBe('SE');
    expect(bearingLabel(from, { x: 1, y: 9 })).toBe('SW');
    expect(bearingLabel(from, { x: 1, y: 1 })).toBe('NW');
  });

  it('snaps a near-cardinal offset to the closest sector', () => {
    // Mostly east, slightly north: within 22.5 degrees of due east, so E.
    expect(bearingLabel(from, { x: 15, y: 4 })).toBe('E');
    // Far enough north to cross into NE.
    expect(bearingLabel(from, { x: 15, y: -8 })).toBe('NE');
  });
});
