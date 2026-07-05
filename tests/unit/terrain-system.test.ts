import { describe, it, expect } from 'vitest';
import {
  getTerrain,
  isPassable,
  isPassableWith,
  getSpeedModifier,
} from '../../src/systems/terrain-system';

describe('terrain-system', () => {
  it('returns terrain definitions by id', () => {
    expect(getTerrain('road')?.name).toBe('Road');
    expect(getTerrain('nope')).toBeUndefined();
  });

  it('reports passability, treating unknown terrain as blocked', () => {
    expect(isPassable('plains')).toBe(true);
    expect(isPassable('road')).toBe(true);
    expect(isPassable('water')).toBe(false);
    expect(isPassable('mountain')).toBe(false);
    expect(isPassable('nope')).toBe(false);
  });

  it('gives roads a speed bonus and forest a penalty', () => {
    expect(getSpeedModifier('road')).toBeGreaterThan(1);
    expect(getSpeedModifier('bridge')).toBeGreaterThan(1);
    expect(getSpeedModifier('plains')).toBe(1);
    expect(getSpeedModifier('forest')).toBeLessThan(1);
  });

  it('returns a zero speed modifier for impassable and unknown terrain', () => {
    expect(getSpeedModifier('water')).toBe(0);
    expect(getSpeedModifier('mountain')).toBe(0);
    expect(getSpeedModifier('nope')).toBe(0);
  });

  describe('isPassableWith', () => {
    it('ignores unlocks for ungated terrain', () => {
      expect(isPassableWith('plains', new Set())).toBe(true);
      expect(isPassableWith('water', new Set(['ford-crossing']))).toBe(false);
    });

    it('gates the ford behind its unlock id', () => {
      expect(isPassableWith('ford', new Set())).toBe(false);
      expect(isPassableWith('ford', new Set(['ford-crossing']))).toBe(true);
    });

    it('treats unknown terrain as blocked', () => {
      expect(isPassableWith('nope', new Set(['ford-crossing']))).toBe(false);
    });
  });
});
