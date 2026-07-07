import { describe, it, expect } from 'vitest';
import {
  totalXp,
  xpForLevel,
  levelForXp,
  skillPointsForLevel,
  levelProgress,
} from '../../src/systems/experience';

describe('totalXp', () => {
  it('sums the normal case', () => {
    const xp = totalXp({ deliveries: 2, distanceTiles: 10, discoveries: 1 });
    expect(xp).toBe(2 * 25 + 10 * 1 + 1 * 15);
  });

  it('floors a fractional distanceTiles', () => {
    const xp = totalXp({ deliveries: 0, distanceTiles: 10.9, discoveries: 0 });
    expect(xp).toBe(10);
  });

  it('treats negative sources as 0', () => {
    const xp = totalXp({ deliveries: -5, distanceTiles: -1, discoveries: -2 });
    expect(xp).toBe(0);
  });

  it('treats NaN sources as 0', () => {
    const xp = totalXp({ deliveries: NaN, distanceTiles: 10, discoveries: NaN });
    expect(xp).toBe(10);
  });
});

describe('xpForLevel', () => {
  it('matches known thresholds', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(50);
    expect(xpForLevel(3)).toBe(150);
    expect(xpForLevel(4)).toBe(300);
    expect(xpForLevel(5)).toBe(500);
  });
});

describe('levelForXp', () => {
  it('resolves boundary values around level thresholds', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(49)).toBe(1);
    expect(levelForXp(50)).toBe(2);
    expect(levelForXp(149)).toBe(2);
    expect(levelForXp(150)).toBe(3);
  });

  it('resolves a large xp value', () => {
    expect(levelForXp(xpForLevel(8))).toBe(8);
  });

  it('treats negative xp as level 1', () => {
    expect(levelForXp(-100)).toBe(1);
  });

  it('roundtrips xpForLevel -> levelForXp for levels 1 through 8', () => {
    for (let level = 1; level <= 8; level++) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
    }
  });
});

describe('skillPointsForLevel', () => {
  it('grants one point per level after the first', () => {
    expect(skillPointsForLevel(1)).toBe(0);
    expect(skillPointsForLevel(5)).toBe(4);
    expect(skillPointsForLevel(0)).toBe(0);
  });
});

describe('levelProgress', () => {
  it('computes fields correctly between levels', () => {
    const progress = levelProgress(100);
    expect(progress.level).toBe(2);
    expect(progress.xp).toBe(100);
    expect(progress.xpIntoLevel).toBe(50);
    expect(progress.xpForNextLevel).toBe(100);
  });
});
