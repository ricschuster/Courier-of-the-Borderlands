import { describe, it, expect } from 'vitest';
import {
  CARGO_CATEGORIES,
  DEFAULT_CARGO_CATEGORY,
  getCargoCategory,
  cargoPayout,
  type CargoCategoryId,
} from '../../src/systems/cargo-types';

describe('cargo categories', () => {
  it('defines all four expected categories', () => {
    const ids: CargoCategoryId[] = ['letters', 'goods', 'rumours', 'secrets'];
    for (const id of ids) {
      expect(CARGO_CATEGORIES[id]).toBeDefined();
      expect(CARGO_CATEGORIES[id].id).toBe(id);
    }
  });

  it('defaults to goods', () => {
    expect(DEFAULT_CARGO_CATEGORY).toBe('goods');
  });
});

describe('getCargoCategory', () => {
  it('returns the matching category for each known id', () => {
    expect(getCargoCategory('letters').id).toBe('letters');
    expect(getCargoCategory('goods').id).toBe('goods');
    expect(getCargoCategory('rumours').id).toBe('rumours');
    expect(getCargoCategory('secrets').id).toBe('secrets');
  });

  it('falls back to the default category when undefined', () => {
    expect(getCargoCategory(undefined).id).toBe(DEFAULT_CARGO_CATEGORY);
  });
});

describe('cargoPayout', () => {
  it('leaves the base reward unchanged for goods', () => {
    expect(cargoPayout(100, 'goods')).toBe(100);
  });

  it('leaves the base reward unchanged when cargoType is undefined', () => {
    expect(cargoPayout(100, undefined)).toBe(100);
  });

  it('pays more for letters, rumours, and secrets', () => {
    expect(cargoPayout(100, 'letters')).toBe(105);
    expect(cargoPayout(100, 'rumours')).toBe(110);
    expect(cargoPayout(100, 'secrets')).toBe(120);
  });

  it('rounds to the nearest whole coin', () => {
    // 61 * 1.05 = 64.05 -> 64
    expect(cargoPayout(61, 'letters')).toBe(64);
    // 63 * 1.1 = 69.3 -> 69
    expect(cargoPayout(63, 'rumours')).toBe(69);
  });
});
