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
      expect(getWearSpeedModifier('plains')).toBe(getSpeedModifier('plains'));
      expect(getWearSpeedModifier('nope')).toBe(0);
    });

    it('decouples the road: eased movement (1.2x) but pinned at 1.4x wear so it never wears (#185)', () => {
      // The road moves at 1.2x after the playtest ease, but its wear modifier is
      // held at 1.4x (the max), so roads still normalise to roughness 0 and the
      // travel-sink economy is unchanged by the speed ease.
      expect(getSpeedModifier('road')).toBe(1.2);
      expect(getWearSpeedModifier('road')).toBe(1.4);
      expect(getWearSpeedModifier('road')).toBeGreaterThan(getSpeedModifier('road'));
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
