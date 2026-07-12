import { describe, it, expect } from 'vitest';
import {
  sanitizeRanks,
  rankOf,
  pointsSpent,
  availablePoints,
  shouldNudgeUnspentSkills,
  canRankUp,
  rankUp,
  skillSpeedBonus,
  skillRevealBonus,
  skillRewardBonus,
  skillFlag,
  derivedSkillFlags,
} from '../../src/systems/skills';

describe('sanitizeRanks', () => {
  it('drops unknown ids', () => {
    expect(sanitizeRanks({ nonsense: 2 })).toEqual({});
  });

  it('floors non-integer ranks', () => {
    expect(sanitizeRanks({ wayfinder: 2.7 })).toEqual({ wayfinder: 2 });
  });

  it('clamps ranks above maxRank to maxRank', () => {
    expect(sanitizeRanks({ wayfinder: 99 })).toEqual({ wayfinder: 3 });
  });

  it('drops zero and negative ranks', () => {
    expect(sanitizeRanks({ wayfinder: 0, 'off-road': -1 })).toEqual({});
  });

  it('keeps valid entries', () => {
    expect(sanitizeRanks({ wayfinder: 2, 'off-road': 1 })).toEqual({
      wayfinder: 2,
      'off-road': 1,
    });
  });

  it('drops non-numeric or invalid rank values', () => {
    expect(sanitizeRanks({ wayfinder: 'two', 'off-road': NaN })).toEqual({});
  });
});

describe('rankOf', () => {
  it('returns 0 when absent', () => {
    expect(rankOf({}, 'wayfinder')).toBe(0);
  });

  it('returns the stored rank', () => {
    expect(rankOf({ wayfinder: 2 }, 'wayfinder')).toBe(2);
  });
});

describe('pointsSpent', () => {
  it('sums ranks across known skills', () => {
    expect(pointsSpent({ wayfinder: 2, 'off-road': 1 })).toBe(3);
  });

  it('ignores unknown ids', () => {
    expect(pointsSpent({ wayfinder: 1, nonsense: 5 })).toBe(1);
  });
});

describe('availablePoints', () => {
  it('subtracts spent points from level allowance', () => {
    expect(availablePoints(5, { wayfinder: 2 })).toBe(2);
  });

  it('never goes negative even if data is over-spent', () => {
    expect(availablePoints(1, { wayfinder: 3, 'off-road': 3 })).toBe(0);
  });
});

describe('shouldNudgeUnspentSkills', () => {
  it('nudges on a level-up with points banked after the first teach', () => {
    expect(
      shouldNudgeUnspentSkills({ leveledUp: true, unspentPoints: 2, firstTeachSeen: true }),
    ).toBe(true);
  });

  it('stays quiet when the level did not just increase', () => {
    expect(
      shouldNudgeUnspentSkills({ leveledUp: false, unspentPoints: 2, firstTeachSeen: true }),
    ).toBe(false);
  });

  it('stays quiet when there are no unspent points', () => {
    expect(
      shouldNudgeUnspentSkills({ leveledUp: true, unspentPoints: 0, firstTeachSeen: true }),
    ).toBe(false);
  });

  it('defers to the one-time teach on the first point (teach not yet seen)', () => {
    expect(
      shouldNudgeUnspentSkills({ leveledUp: true, unspentPoints: 1, firstTeachSeen: false }),
    ).toBe(false);
  });
});

describe('canRankUp', () => {
  it('is false at maxRank', () => {
    expect(canRankUp({ wayfinder: 3 }, 'wayfinder', 10)).toBe(false);
  });

  it('is false with no available points', () => {
    expect(canRankUp({ wayfinder: 1 }, 'wayfinder', 1)).toBe(false);
  });

  it('is true when below maxRank and points are available', () => {
    expect(canRankUp({ wayfinder: 1 }, 'wayfinder', 5)).toBe(true);
  });

  it('is false for an unknown id', () => {
    expect(canRankUp({}, 'nonsense', 10)).toBe(false);
  });
});

describe('rankUp', () => {
  it('increments the rank', () => {
    expect(rankUp({ wayfinder: 1 }, 'wayfinder')).toEqual({ wayfinder: 2 });
  });

  it('does not mutate the input', () => {
    const input = { wayfinder: 1 };
    rankUp(input, 'wayfinder');
    expect(input).toEqual({ wayfinder: 1 });
  });

  it('is a no-op for an unknown id', () => {
    expect(rankUp({ wayfinder: 1 }, 'nonsense')).toEqual({ wayfinder: 1 });
  });

  it('is a no-op at maxRank', () => {
    expect(rankUp({ wayfinder: 3 }, 'wayfinder')).toEqual({ wayfinder: 3 });
  });
});

describe('derivedSkillFlags', () => {
  it('names a skill flag with the skill prefix', () => {
    expect(skillFlag('cipher')).toBe('skill_cipher');
  });

  it('is empty when no skills are owned', () => {
    expect(derivedSkillFlags({})).toEqual([]);
  });

  it('grants a flag for each owned skill (rank at least 1)', () => {
    expect(derivedSkillFlags({ cipher: 1, 'off-road': 2 }).sort()).toEqual(
      ['skill_cipher', 'skill_off-road'].sort(),
    );
  });

  it('ignores unknown ids so a stale save cannot grant a phantom flag', () => {
    expect(derivedSkillFlags({ nonsense: 3 })).toEqual([]);
  });
});

describe('skill effect aggregators', () => {
  it('sums off-road speed bonus', () => {
    expect(skillSpeedBonus({ 'off-road': 2 })).toBeCloseTo(0.2);
  });

  it('sums wayfinder reveal bonus', () => {
    expect(skillRevealBonus({ wayfinder: 3 })).toBe(3);
  });

  it('sums negotiator reward bonus', () => {
    expect(skillRewardBonus({ negotiator: 1 })).toBeCloseTo(0.1);
  });

  it('ignores unknown ids and skills with no contribution to the field', () => {
    expect(skillSpeedBonus({ wayfinder: 3, nonsense: 5 })).toBe(0);
    expect(skillRevealBonus({ 'off-road': 3 })).toBe(0);
    expect(skillRewardBonus({ wayfinder: 3 })).toBe(0);
  });
});
