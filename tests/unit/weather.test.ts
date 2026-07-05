import { describe, it, expect } from 'vitest';
import { WEATHERS, weatherByIndex } from '../../src/systems/weather';

describe('WEATHERS catalogue', () => {
  it('is non-empty', () => {
    expect(WEATHERS.length).toBeGreaterThan(0);
  });

  it('has unique ids across all entries', () => {
    const ids = WEATHERS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every speedMultiplier within [0.85, 1.15]', () => {
    for (const w of WEATHERS) {
      expect(w.speedMultiplier).toBeGreaterThanOrEqual(0.85);
      expect(w.speedMultiplier).toBeLessThanOrEqual(1.15);
    }
  });
});

describe('weatherByIndex', () => {
  it('returns index 0 for index 0', () => {
    expect(weatherByIndex(0)).toBe(WEATHERS[0]);
  });

  it('wraps indices >= length back into the array', () => {
    const len = WEATHERS.length;
    expect(weatherByIndex(len)).toBe(WEATHERS[0]);
    expect(weatherByIndex(len + 1)).toBe(WEATHERS[1]);
  });

  it('wraps negative indices correctly', () => {
    const len = WEATHERS.length;
    // -1 should give the last element
    expect(weatherByIndex(-1)).toBe(WEATHERS[len - 1]);
    // -len should wrap back to index 0
    expect(weatherByIndex(-len)).toBe(WEATHERS[0]);
  });

  it('returns a valid Weather object for any integer index', () => {
    const candidates = [-999, -1, 0, 1, 7, 100, 1000];
    for (const i of candidates) {
      const w = weatherByIndex(i);
      expect(typeof w.id).toBe('string');
      expect(typeof w.label).toBe('string');
      expect(typeof w.speedMultiplier).toBe('number');
      expect(typeof w.revealBonus).toBe('number');
    }
  });
});
