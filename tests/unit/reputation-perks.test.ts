import { describe, it, expect } from 'vitest';
import {
  perkFor,
  rewardMultiplier,
  applyRewardBonus,
  REWARD_PERKS,
} from '../../src/systems/reputation-perks';

describe('perkFor', () => {
  it('returns the floor perk at reputation 0', () => {
    const perk = perkFor(0);
    expect(perk.minReputation).toBe(0);
    expect(perk.label).toBe('standard rates');
  });

  it('returns the correct perk exactly at the second threshold (3)', () => {
    const perk = perkFor(3);
    expect(perk.minReputation).toBe(3);
    expect(perk.label).toBe('favoured rates');
  });

  it('returns the correct perk exactly at the third threshold (8)', () => {
    const perk = perkFor(8);
    expect(perk.minReputation).toBe(8);
    expect(perk.label).toBe('trusted rates');
  });

  it('returns the correct perk exactly at the fourth threshold (15)', () => {
    const perk = perkFor(15);
    expect(perk.minReputation).toBe(15);
    expect(perk.label).toBe('honoured rates');
  });

  it('returns the floor perk for a value between 0 and 2 (below second threshold)', () => {
    const perk = perkFor(2);
    expect(perk.label).toBe('standard rates');
  });

  it('returns the lower perk for a value just below a threshold (rep 7, below 8)', () => {
    const perk = perkFor(7);
    expect(perk.label).toBe('favoured rates');
    expect(perk.minReputation).toBe(3);
  });

  it('returns the lower perk for a value just below threshold 15 (rep 14)', () => {
    const perk = perkFor(14);
    expect(perk.label).toBe('trusted rates');
    expect(perk.minReputation).toBe(8);
  });

  it('returns a perk in the REWARD_PERKS array for any reputation', () => {
    for (const rep of [0, 1, 3, 5, 8, 10, 15, 20, 100]) {
      const perk = perkFor(rep);
      expect(REWARD_PERKS).toContain(perk);
    }
  });
});

describe('rewardMultiplier', () => {
  it('returns 1 at reputation 0', () => {
    expect(rewardMultiplier(0)).toBe(1);
  });

  it('returns 1.1 at reputation 3', () => {
    expect(rewardMultiplier(3)).toBe(1.1);
  });

  it('returns 1.25 at reputation 8', () => {
    expect(rewardMultiplier(8)).toBe(1.25);
  });

  it('returns 1.5 at reputation 15', () => {
    expect(rewardMultiplier(15)).toBe(1.5);
  });

  it('matches perkFor multiplier for any reputation', () => {
    for (const rep of [0, 2, 3, 7, 8, 14, 15, 50]) {
      expect(rewardMultiplier(rep)).toBe(perkFor(rep).rewardMultiplier);
    }
  });
});

describe('applyRewardBonus', () => {
  it('returns the base reward unchanged at reputation 0 (multiplier is 1)', () => {
    expect(applyRewardBonus(100, 0)).toBe(100);
  });

  it('applies a multiplier and rounds at reputation 3', () => {
    // 100 * 1.1 = 110
    expect(applyRewardBonus(100, 3)).toBe(110);
  });

  it('applies a multiplier and rounds at reputation 8', () => {
    // 100 * 1.25 = 125
    expect(applyRewardBonus(100, 8)).toBe(125);
  });

  it('applies a multiplier and rounds at reputation 15', () => {
    // 100 * 1.5 = 150
    expect(applyRewardBonus(100, 15)).toBe(150);
  });

  it('rounds fractional results correctly', () => {
    // 7 * 1.1 = 7.7 -> rounds to 8
    expect(applyRewardBonus(7, 3)).toBe(8);
    // 3 * 1.25 = 3.75 -> rounds to 4
    expect(applyRewardBonus(3, 8)).toBe(4);
  });

  it('is never below baseReward', () => {
    // Multiplier >= 1 always, so this holds. Verify it explicitly.
    expect(applyRewardBonus(50, 0)).toBeGreaterThanOrEqual(50);
    expect(applyRewardBonus(50, 15)).toBeGreaterThanOrEqual(50);
  });

  it('uses the lower perk for a rep just below a threshold', () => {
    // rep 7 uses favoured rates (1.1)
    // 200 * 1.1 = 220
    expect(applyRewardBonus(200, 7)).toBe(220);
  });
});
