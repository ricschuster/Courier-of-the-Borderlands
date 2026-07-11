import { describe, it, expect } from 'vitest';
import {
  roughness,
  wearReliefFactor,
  offRoadWearFactor,
  wearPerTile,
  applyWear,
  clampCondition,
  sanitizeCondition,
  repairCost,
  repair,
  limpMultiplier,
  isStranded,
  rescue,
  maxConditionForLevel,
  MAX_CONDITION,
  DEFAULT_WAGON_TUNING,
  WAGON_TUNING,
} from '../../src/systems/wagon-condition';

// Difficulty-tunable knobs now live in a profile; alias the standard one so the
// assertions read against its values rather than duplicating literals.
const T = DEFAULT_WAGON_TUNING;
const WEAR_RELIEF_FLOOR = T.wearReliefFloor;
const OFFROAD_WEAR_FLOOR = T.offRoadWearFloor;
const COST_PER_PERCENT = T.costPerPercent;
const RESCUE_COST = T.rescueCost;
const LIMP_SPEED = T.limpSpeed;
const WEAR_BASE = T.wearBase;
const WEAR_COEF = T.wearCoef;

describe('roughness', () => {
  it('is 0 on the road (max speed modifier)', () => {
    expect(roughness(1.4)).toBe(0);
  });

  it('grows as terrain slows', () => {
    // plains 1.0 -> ~0.286, forest 0.55 -> ~0.607, marsh 0.45 -> ~0.679
    expect(roughness(1.0)).toBeCloseTo(0.2857, 3);
    expect(roughness(0.55)).toBeCloseTo(0.6071, 3);
    expect(roughness(0.45)).toBeCloseTo(0.6786, 3);
  });

  it('never goes negative for faster-than-road terrain', () => {
    expect(roughness(2.0)).toBe(0);
  });
});

describe('wearReliefFactor', () => {
  it('is 1 with no relief upgrades', () => {
    expect(wearReliefFactor(0)).toBe(1);
  });

  it('drops per relief upgrade', () => {
    expect(wearReliefFactor(1)).toBeCloseTo(0.85, 5);
    expect(wearReliefFactor(3)).toBeCloseTo(0.55, 5);
  });

  it('never falls below the floor no matter how many upgrades', () => {
    expect(wearReliefFactor(10)).toBe(WEAR_RELIEF_FLOOR);
  });
});

describe('offRoadWearFactor', () => {
  it('is 1 at rank 0', () => {
    expect(offRoadWearFactor(0)).toBe(1);
  });

  it('drops per rank and floors', () => {
    expect(offRoadWearFactor(3)).toBeCloseTo(0.7, 5);
    expect(offRoadWearFactor(9)).toBe(OFFROAD_WEAR_FLOOR);
  });
});

describe('wearPerTile', () => {
  it('is a bare trickle on the road with no investment', () => {
    // Roads normalise to roughness 0, so only the base wear applies.
    expect(wearPerTile(1.4, 0, 0)).toBeCloseTo(WEAR_BASE, 5);
  });

  it('is much higher on rough terrain', () => {
    // forest 0.55 -> roughness ~0.6071, so base + coef * roughness.
    const expected = WEAR_BASE + WEAR_COEF * roughness(0.55);
    expect(wearPerTile(0.55, 0, 0)).toBeCloseTo(expected, 5);
    expect(wearPerTile(0.55, 0, 0)).toBeGreaterThan(wearPerTile(1.4, 0, 0));
  });

  it('is reduced but never zeroed by a fully invested wagon', () => {
    const bare = wearPerTile(0.4, 0, 0); // deep-mire, no investment
    const maxed = wearPerTile(0.4, 3, 3); // all relief upgrades + off-road rank 3
    expect(maxed).toBeLessThan(bare);
    // 0.55 relief * 0.7 off-road = 0.385 of the bare wear, still meaningful
    expect(maxed).toBeCloseTo(bare * 0.55 * 0.7, 5);
    expect(maxed).toBeGreaterThan(0);
  });
});

describe('applyWear and clampCondition', () => {
  it('subtracts wear', () => {
    expect(applyWear(100, 0.3)).toBeCloseTo(99.7, 5);
  });

  it('never drops below 0', () => {
    expect(applyWear(0.2, 5)).toBe(0);
  });

  it('clamps out-of-range and non-finite values', () => {
    expect(clampCondition(150)).toBe(100);
    expect(clampCondition(-5)).toBe(0);
    expect(clampCondition(Number.NaN)).toBe(MAX_CONDITION);
  });
});

describe('sanitizeCondition', () => {
  it('defaults absent or malformed to full (legacy saves unaffected)', () => {
    expect(sanitizeCondition(undefined)).toBe(100);
    expect(sanitizeCondition('nope')).toBe(100);
    expect(sanitizeCondition(null)).toBe(100);
  });

  it('clamps a valid number', () => {
    expect(sanitizeCondition(50)).toBe(50);
    expect(sanitizeCondition(150)).toBe(100);
    expect(sanitizeCondition(-1)).toBe(0);
  });
});

describe('repairCost', () => {
  it('is 0 at full condition', () => {
    expect(repairCost(100)).toBe(0);
  });

  it('scales with missing condition', () => {
    expect(repairCost(0)).toBe(100 * COST_PER_PERCENT);
    expect(repairCost(50)).toBe(50 * COST_PER_PERCENT);
  });

  it('rounds up a fractional condition', () => {
    expect(repairCost(99.5)).toBe(Math.ceil(0.5 * COST_PER_PERCENT));
  });
});

describe('maxConditionForLevel', () => {
  it('is the starting tank at level 1', () => {
    expect(maxConditionForLevel(1)).toBe(T.startingMaxCondition);
  });

  it('treats level below 1 as level 1', () => {
    expect(maxConditionForLevel(0)).toBe(T.startingMaxCondition);
  });

  it('grows by the per-level amount', () => {
    expect(maxConditionForLevel(2)).toBe(T.startingMaxCondition + T.maxConditionGrowthPerLevel);
    expect(maxConditionForLevel(3)).toBe(
      T.startingMaxCondition + 2 * T.maxConditionGrowthPerLevel,
    );
  });

  it('caps at the absolute maximum', () => {
    expect(maxConditionForLevel(50)).toBe(MAX_CONDITION);
  });
});

describe('repair', () => {
  it('fully repairs when affordable', () => {
    const r = repair(50, 500);
    expect(r.ok).toBe(true);
    expect(r.full).toBe(true);
    expect(r.condition).toBe(100);
    expect(r.coins).toBe(500 - 50 * COST_PER_PERCENT);
  });

  it('fills only to the current max, not past it', () => {
    // A small level-1 tank of 40: repairing from 10 tops out at 40, not 100.
    const r = repair(10, 1000, 40);
    expect(r.ok).toBe(true);
    expect(r.full).toBe(true);
    expect(r.condition).toBe(40);
    expect(r.coins).toBe(1000 - 30 * COST_PER_PERCENT);
  });

  it('partially repairs a poor courier', () => {
    // Exactly enough coins for 10 percent, spent to the last coin.
    const r = repair(0, 10 * COST_PER_PERCENT);
    expect(r.ok).toBe(true);
    expect(r.full).toBe(false);
    expect(r.condition).toBe(10);
    expect(r.coins).toBe(0);
  });

  it('does nothing when already full', () => {
    const r = repair(100, 500);
    expect(r.ok).toBe(false);
    expect(r.full).toBe(true);
    expect(r.condition).toBe(100);
    expect(r.coins).toBe(500);
  });

  it('does nothing when too poor to buy even one percent', () => {
    const r = repair(50, COST_PER_PERCENT - 1);
    expect(r.ok).toBe(false);
    expect(r.condition).toBe(50);
    expect(r.coins).toBe(COST_PER_PERCENT - 1);
  });
});

describe('limpMultiplier and isStranded', () => {
  it('is full speed above 0', () => {
    expect(limpMultiplier(1)).toBe(1);
    expect(limpMultiplier(50)).toBe(1);
    expect(isStranded(1)).toBe(false);
  });

  it('is limp speed at 0', () => {
    expect(limpMultiplier(0)).toBe(LIMP_SPEED);
    expect(isStranded(0)).toBe(true);
  });
});

describe('rescue', () => {
  it('charges the fee when affordable', () => {
    const r = rescue(80);
    expect(r.ok).toBe(true);
    expect(r.coins).toBe(80 - RESCUE_COST);
  });

  it('refuses when too poor', () => {
    const r = rescue(RESCUE_COST - 1);
    expect(r.ok).toBe(false);
    expect(r.coins).toBe(RESCUE_COST - 1);
  });
});

describe('difficulty presets', () => {
  const marsh = 0.45;

  it('standard is the default profile', () => {
    expect(WAGON_TUNING.standard).toBe(DEFAULT_WAGON_TUNING);
  });

  it('demanding wears faster and costs more than standard', () => {
    expect(wearPerTile(marsh, 0, 0, WAGON_TUNING.demanding)).toBeGreaterThan(
      wearPerTile(marsh, 0, 0, WAGON_TUNING.standard),
    );
    expect(repairCost(0, 100, WAGON_TUNING.demanding)).toBeGreaterThan(
      repairCost(0, 100, WAGON_TUNING.standard),
    );
  });

  it('relaxed wears slower and costs less than standard', () => {
    expect(wearPerTile(marsh, 0, 0, WAGON_TUNING.relaxed)).toBeLessThan(
      wearPerTile(marsh, 0, 0, WAGON_TUNING.standard),
    );
    expect(repairCost(0, 100, WAGON_TUNING.relaxed)).toBeLessThan(
      repairCost(0, 100, WAGON_TUNING.standard),
    );
  });
});
