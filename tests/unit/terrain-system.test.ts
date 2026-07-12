import { describe, it, expect } from 'vitest';
import {
  getTerrain,
  isPassable,
  isPassableWith,
  getSpeedModifier,
  getWearSpeedModifier,
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

  describe('getWearSpeedModifier (#176)', () => {
    it('falls back to the movement speed modifier when no override is set', () => {
      expect(getWearSpeedModifier('forest')).toBe(getSpeedModifier('forest'));
      expect(getWearSpeedModifier('road')).toBe(getSpeedModifier('road'));
      expect(getWearSpeedModifier('nope')).toBe(0);
    });

    it('decouples the trail: it drives faster than marsh but wears the same', () => {
      // Trail is passable and moves a touch quicker than the marsh it crosses...
      expect(isPassable('trail')).toBe(true);
      expect(getSpeedModifier('trail')).toBeGreaterThan(getSpeedModifier('marsh'));
      // ...but its wear modifier matches marsh, so it is not a difficulty relief.
      expect(getWearSpeedModifier('trail')).toBe(getSpeedModifier('marsh'));
      expect(getWearSpeedModifier('trail')).toBeLessThan(getSpeedModifier('trail'));
    });
  });

  describe('isPassableWith', () => {
    it('ignores unlocks for ungated terrain', () => {
      expect(isPassableWith('plains', new Set())).toBe(true);
      expect(isPassableWith('water', new Set(['ford-crossing']))).toBe(false);
    });

    it('gates the ford behind its unlock id', () => {
      expect(isPassableWith('ford-greybridge', new Set())).toBe(false);
      expect(isPassableWith('ford-greybridge', new Set(['ford-crossing-greybridge']))).toBe(true);
    });

    it('treats unknown terrain as blocked', () => {
      expect(isPassableWith('nope', new Set(['ford-crossing-greybridge']))).toBe(false);
    });

    it('keeps each region ford independent', () => {
      expect(isPassableWith('ford-saltreach', new Set(['ford-crossing-greybridge']))).toBe(false);
      expect(isPassableWith('ford-saltreach', new Set(['ford-crossing-saltreach']))).toBe(true);
    });
  });
});
