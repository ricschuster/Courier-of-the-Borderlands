import { describe, it, expect } from 'vitest';
import {
  ACHIEVEMENTS,
  earnedAchievements,
  courierTitle,
} from '../../src/systems/achievements';
import type { AchievementStat } from '../../src/systems/achievements';

// A stat representing a brand-new courier who has done nothing yet.
const FRESH_STAT: AchievementStat = {
  deliveries: 0,
  distanceTiles: 0,
  placesFound: 0,
  totalPlaces: 5,
  upgradesOwned: 0,
  totalUpgrades: 3,
  fordUnlocked: false,
  regionCleared: false,
};

describe('ACHIEVEMENTS list', () => {
  it('is non-empty', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThan(0);
  });

  it('has unique ids', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every entry has a non-empty name and description', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
    }
  });
});

describe('earnedAchievements', () => {
  it('returns no achievements for a fresh stat', () => {
    expect(earnedAchievements(FRESH_STAT)).toEqual([]);
  });

  it('unlocks first-delivery when deliveries reaches 1', () => {
    const stat: AchievementStat = { ...FRESH_STAT, deliveries: 1 };
    expect(earnedAchievements(stat)).toContain('first-delivery');
  });

  it('does not unlock first-delivery at 0 deliveries', () => {
    expect(earnedAchievements(FRESH_STAT)).not.toContain('first-delivery');
  });

  it('unlocks ford-finder when ford is unlocked', () => {
    const stat: AchievementStat = { ...FRESH_STAT, fordUnlocked: true };
    expect(earnedAchievements(stat)).toContain('ford-finder');
  });

  it('unlocks cartographer when all places found', () => {
    const stat: AchievementStat = { ...FRESH_STAT, placesFound: 5, totalPlaces: 5 };
    expect(earnedAchievements(stat)).toContain('cartographer');
  });

  it('does not unlock cartographer when only some places found', () => {
    const stat: AchievementStat = { ...FRESH_STAT, placesFound: 4, totalPlaces: 5 };
    expect(earnedAchievements(stat)).not.toContain('cartographer');
  });

  it('does not unlock cartographer when totalPlaces is 0', () => {
    const stat: AchievementStat = { ...FRESH_STAT, placesFound: 0, totalPlaces: 0 };
    expect(earnedAchievements(stat)).not.toContain('cartographer');
  });

  it('unlocks well-equipped when all upgrades owned', () => {
    const stat: AchievementStat = { ...FRESH_STAT, upgradesOwned: 3, totalUpgrades: 3 };
    expect(earnedAchievements(stat)).toContain('well-equipped');
  });

  it('does not unlock well-equipped when totalUpgrades is 0', () => {
    const stat: AchievementStat = { ...FRESH_STAT, upgradesOwned: 0, totalUpgrades: 0 };
    expect(earnedAchievements(stat)).not.toContain('well-equipped');
  });

  it('unlocks long-hauler at exactly 100 tiles', () => {
    const stat: AchievementStat = { ...FRESH_STAT, distanceTiles: 100 };
    expect(earnedAchievements(stat)).toContain('long-hauler');
  });

  it('does not unlock long-hauler at 99 tiles', () => {
    const stat: AchievementStat = { ...FRESH_STAT, distanceTiles: 99 };
    expect(earnedAchievements(stat)).not.toContain('long-hauler');
  });

  it('unlocks borderland-courier when region is cleared', () => {
    const stat: AchievementStat = { ...FRESH_STAT, regionCleared: true };
    expect(earnedAchievements(stat)).toContain('borderland-courier');
  });

  it('unlocks all achievements for a fully completed run', () => {
    const stat: AchievementStat = {
      deliveries: 5,
      distanceTiles: 200,
      placesFound: 5,
      totalPlaces: 5,
      upgradesOwned: 3,
      totalUpgrades: 3,
      fordUnlocked: true,
      regionCleared: true,
    };
    const earned = earnedAchievements(stat);
    const allIds = ACHIEVEMENTS.map((a) => a.id);
    for (const id of allIds) {
      expect(earned).toContain(id);
    }
  });
});

describe('courierTitle', () => {
  it('returns Wayfarer for zero deliveries and region not cleared', () => {
    expect(courierTitle(FRESH_STAT)).toBe('Wayfarer');
  });

  it('returns Courier at exactly 1 delivery', () => {
    const stat: AchievementStat = { ...FRESH_STAT, deliveries: 1 };
    expect(courierTitle(stat)).toBe('Courier');
  });

  it('returns Courier at 2 deliveries', () => {
    const stat: AchievementStat = { ...FRESH_STAT, deliveries: 2 };
    expect(courierTitle(stat)).toBe('Courier');
  });

  it('returns Trusted Courier at exactly 3 deliveries', () => {
    const stat: AchievementStat = { ...FRESH_STAT, deliveries: 3 };
    expect(courierTitle(stat)).toBe('Trusted Courier');
  });

  it('returns Trusted Courier at more than 3 deliveries when region not cleared', () => {
    const stat: AchievementStat = { ...FRESH_STAT, deliveries: 10 };
    expect(courierTitle(stat)).toBe('Trusted Courier');
  });

  it('returns Master of the Greybridge when region is cleared, regardless of deliveries', () => {
    const statNoDeliveries: AchievementStat = { ...FRESH_STAT, regionCleared: true };
    expect(courierTitle(statNoDeliveries)).toBe('Master of the Greybridge');

    const statManyDeliveries: AchievementStat = {
      ...FRESH_STAT,
      deliveries: 99,
      regionCleared: true,
    };
    expect(courierTitle(statManyDeliveries)).toBe('Master of the Greybridge');
  });
});
