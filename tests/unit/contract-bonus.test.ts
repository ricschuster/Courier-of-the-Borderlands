import { describe, it, expect } from 'vitest';
import {
  bonusFor,
  bonusAchieved,
  describeBonus,
} from '../../src/systems/contract-bonus';

describe('bonusFor', () => {
  it('returns the swift bonus for grain-to-southmill', () => {
    const bonus = bonusFor('grain-to-southmill');
    expect(bonus).toBeDefined();
    expect(bonus?.kind).toBe('swift');
    expect(bonus?.reward).toBe(25);
    expect(bonus?.maxTiles).toBe(24);
  });

  it('returns the via-ford bonus for rumours-to-ironhollow', () => {
    const bonus = bonusFor('rumours-to-ironhollow');
    expect(bonus).toBeDefined();
    expect(bonus?.kind).toBe('via-ford');
    expect(bonus?.reward).toBe(30);
  });

  it('returns undefined for an unknown contract id', () => {
    expect(bonusFor('no-such-contract')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(bonusFor('')).toBeUndefined();
  });
});

describe('bonusAchieved - via-ford', () => {
  const fordBonus = bonusFor('rumours-to-ironhollow')!;

  it('returns true when the ford was used', () => {
    expect(bonusAchieved(fordBonus, { usedFord: true, tilesDriven: 99 })).toBe(true);
  });

  it('returns false when the ford was not used', () => {
    expect(bonusAchieved(fordBonus, { usedFord: false, tilesDriven: 99 })).toBe(false);
  });

  it('ignores tilesDriven for via-ford bonuses', () => {
    expect(bonusAchieved(fordBonus, { usedFord: true, tilesDriven: 0 })).toBe(true);
    expect(bonusAchieved(fordBonus, { usedFord: false, tilesDriven: 0 })).toBe(false);
  });
});

describe('bonusAchieved - swift', () => {
  const swiftBonus = bonusFor('grain-to-southmill')!;

  it('returns true when tiles driven is exactly at the budget', () => {
    expect(bonusAchieved(swiftBonus, { usedFord: false, tilesDriven: 24 })).toBe(true);
  });

  it('returns true when tiles driven is below the budget', () => {
    expect(bonusAchieved(swiftBonus, { usedFord: false, tilesDriven: 10 })).toBe(true);
  });

  it('returns false when tiles driven exceeds the budget by one', () => {
    expect(bonusAchieved(swiftBonus, { usedFord: false, tilesDriven: 25 })).toBe(false);
  });

  it('returns false when tiles driven greatly exceeds the budget', () => {
    expect(bonusAchieved(swiftBonus, { usedFord: false, tilesDriven: 200 })).toBe(false);
  });

  it('ignores usedFord for swift bonuses', () => {
    expect(bonusAchieved(swiftBonus, { usedFord: true, tilesDriven: 24 })).toBe(true);
    expect(bonusAchieved(swiftBonus, { usedFord: true, tilesDriven: 25 })).toBe(false);
  });

  it('treats an absent maxTiles as unlimited (always true)', () => {
    // Construct a swift bonus with no maxTiles to test the Infinity fallback.
    const unlimitedSwift = {
      kind: 'swift' as const,
      reward: 10,
      description: 'No tile limit',
    };
    expect(bonusAchieved(unlimitedSwift, { usedFord: false, tilesDriven: 999999 })).toBe(true);
  });
});

describe('describeBonus', () => {
  it('formats the via-ford bonus description correctly', () => {
    const bonus = bonusFor('rumours-to-ironhollow')!;
    expect(describeBonus(bonus)).toBe('Bonus: Cross the river at the ford (+30c)');
  });

  it('formats the swift bonus description correctly', () => {
    const bonus = bonusFor('grain-to-southmill')!;
    expect(describeBonus(bonus)).toBe('Bonus: Deliver swiftly, within 24 tiles driven (+25c)');
  });

  it('uses the reward from the bonus object', () => {
    const custom = {
      kind: 'swift' as const,
      reward: 50,
      description: 'Be very fast',
    };
    expect(describeBonus(custom)).toBe('Bonus: Be very fast (+50c)');
  });
});
