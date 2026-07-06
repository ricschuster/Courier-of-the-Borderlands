import { describe, it, expect } from 'vitest';
import { WEATHERS, weatherByIndex, pickWeather } from '../../src/systems/weather';
import { createRng } from '../../src/systems/rng';

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

describe('pickWeather', () => {
  it('is deterministic for a given seed', () => {
    expect(pickWeather(createRng(1234))).toBe(pickWeather(createRng(1234)));
  });

  it('always returns a weather from the catalogue', () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(WEATHERS).toContain(pickWeather(createRng(seed)));
    }
  });

  it('reaches every catalogue entry across seeds', () => {
    const seen = new Set(Array.from({ length: 200 }, (_, seed) => pickWeather(createRng(seed)).id));
    expect(seen).toEqual(new Set(WEATHERS.map((w) => w.id)));
  });
});
