import { describe, it, expect } from 'vitest';
import {
  roughness,
  wearReliefFactor,
  wearPerTile,
  applyWear,
  clampCondition,
  sanitizeCondition,
  repairCost,
  repair,
  repairHelpText,
  limpMultiplier,
  isStranded,
  conditionFraction,
  isLowCondition,
  lowConditionWarning,
  LOW_CONDITION_FRACTION,
  rescue,
  maxConditionForLevel,
  MAX_CONDITION,
  DEFAULT_WAGON_TUNING,
  WAGON_TUNING,
  DIFFICULTIES,
  isDifficulty,
  nextDifficulty,
  difficultyLabel,
} from '../../src/systems/wagon-condition';

// Difficulty-tunable knobs now live in a profile; alias the standard one so the
// assertions read against its values rather than duplicating literals.
const T = DEFAULT_WAGON_TUNING;
const WEAR_RELIEF_FLOOR = T.wearReliefFloor;
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

  it('drops a quarter per relief upgrade', () => {
    expect(wearReliefFactor(1)).toBeCloseTo(0.75, 5);
    // All three relief upgrades (290 coins) leave 35% of the bare wear, which is
    // the floor: coins are the strongest answer to the sink in the game (#412).
    expect(wearReliefFactor(3)).toBeCloseTo(0.35, 5);
  });

  it('never falls below the floor no matter how many upgrades', () => {
    expect(wearReliefFactor(10)).toBe(WEAR_RELIEF_FLOOR);
  });
});

describe('wearPerTile', () => {
  it('is a bare trickle on the road with no investment', () => {
    // Roads normalise to roughness 0, so only the base wear applies.
    expect(wearPerTile(1.4, 0)).toBeCloseTo(WEAR_BASE, 5);
  });

  it('is much higher on rough terrain', () => {
    // forest 0.55 -> roughness ~0.6071, so base + coef * roughness.
    const expected = WEAR_BASE + WEAR_COEF * roughness(0.55);
    expect(wearPerTile(0.55, 0)).toBeCloseTo(expected, 5);
    expect(wearPerTile(0.55, 0)).toBeGreaterThan(wearPerTile(1.4, 0));
  });

  it('is reduced but never zeroed by a fully invested wagon', () => {
    const bare = wearPerTile(0.4, 0); // deep-mire, no investment
    const maxed = wearPerTile(0.4, 3); // all relief upgrades bought
    expect(maxed).toBeLessThan(bare);
    // 0.35 of the bare wear, still meaningful: a maxed wagon wears less, never
    // nothing (owner decision 5).
    expect(maxed).toBeCloseTo(bare * 0.35, 5);
    expect(maxed).toBeGreaterThan(0);
  });

  it('is unchanged by the Off-road skill: durability is bought with coins (#412)', () => {
    // The signature has no skill rank at all, so ranking Off-road cannot touch
    // wear. Guarding the count-only dependence keeps a future "small" re-add of
    // a skill term from quietly restoring the substitution slice 5 removed.
    const noRelief = wearPerTile(0.4, 0);
    const oneRelief = wearPerTile(0.4, 1);
    expect(oneRelief).toBeLessThan(noRelief);
    expect(oneRelief).toBeCloseTo(noRelief * 0.75, 5);
  });

  it('scales only the roughness term by the region wear multiplier (#186)', () => {
    // Rough terrain wears more under a >1 region multiplier.
    const normal = wearPerTile(0.45, 0, DEFAULT_WAGON_TUNING, 1);
    const rough = wearPerTile(0.45, 0, DEFAULT_WAGON_TUNING, 1.8);
    expect(rough).toBeGreaterThan(normal);
    // The extra is exactly the coef * roughness term scaled by (1.8 - 1).
    const extra = WEAR_COEF * roughness(0.45) * 0.8;
    expect(rough - normal).toBeCloseTo(extra, 5);
  });

  it('leaves road wear untouched by the region multiplier (roughness 0)', () => {
    // Roads normalise to roughness 0, so the multiplier has nothing to scale:
    // a rough region never makes the open road wear the wagon. This is what
    // keeps Greybridge's 1.8x (#436) from being an exit lock: both roads out of
    // the hub cost the same as they did at 1x.
    const road = wearPerTile(1.4, 0, DEFAULT_WAGON_TUNING, 1.8);
    expect(road).toBeCloseTo(WEAR_BASE, 5);
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

  it('leaves an integer coin balance when repairing fractional wear', () => {
    // Condition is a float (wear accrues fractionally). A full repair must not
    // leak fractional coins into the ledger (playtest: balance read 957.33).
    const r = repair(72.3421, 1000);
    expect(r.ok).toBe(true);
    expect(r.full).toBe(true);
    expect(r.condition).toBe(100);
    expect(Number.isInteger(r.coins)).toBe(true);
  });

  it('charges the quoted repairCost for a full repair', () => {
    // The actual charge must match the figure shown to the player.
    const condition = 63.7;
    const r = repair(condition, 1000);
    expect(r.coins).toBe(1000 - repairCost(condition, MAX_CONDITION));
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

describe('conditionFraction and isLowCondition', () => {
  it('reports the fraction of capacity remaining', () => {
    expect(conditionFraction(50, 100)).toBe(0.5);
    expect(conditionFraction(30, 60)).toBe(0.5);
    expect(conditionFraction(100, 100)).toBe(1);
  });

  it('treats a non-positive capacity as empty', () => {
    expect(conditionFraction(10, 0)).toBe(0);
  });

  it('is low at or below the threshold fraction but above stranded', () => {
    const max = 50;
    // Exactly at the threshold counts as low.
    expect(isLowCondition(max * LOW_CONDITION_FRACTION, max)).toBe(true);
    // Just below the threshold is low.
    expect(isLowCondition(max * LOW_CONDITION_FRACTION - 1, max)).toBe(true);
    // Comfortably above the threshold is not low.
    expect(isLowCondition(max * 0.8, max)).toBe(false);
  });

  it('is not "low" when stranded (that is its own louder state)', () => {
    expect(isLowCondition(0, 50)).toBe(false);
  });
});

describe('rescue', () => {
  it('charges the full fee when affordable', () => {
    const r = rescue(80);
    expect(r.paid).toBe(RESCUE_COST);
    expect(r.coins).toBe(80 - RESCUE_COST);
  });

  it('charges what the courier has when that is less than the fee', () => {
    // #432: refusing here inverted the cost curve, making the tow unaffordable
    // exactly when overreaching is most likely and most valuable.
    const r = rescue(RESCUE_COST - 1);
    expect(r.paid).toBe(RESCUE_COST - 1);
    expect(r.coins).toBe(0);
  });

  it('tows a penniless courier for nothing rather than stranding them', () => {
    expect(rescue(0)).toEqual({ coins: 0, paid: 0 });
  });

  it('never charges a negative fare or hands out coins', () => {
    // A negative purse should not become a payout through the min().
    expect(rescue(-10).paid).toBe(0);
    expect(rescue(-10).coins).toBe(-10);
  });
});

describe('repairHelpText', () => {
  const base = { max: 43, tuning: T };

  it('stranded at a town points at earning through a delivery, not the price alone', () => {
    const msg = repairHelpText({ ...base, atSettlement: true, condition: 0 });
    expect(msg).toContain('Too broke to repair');
    expect(msg).toContain('still crawls');
    expect(msg).toContain('deliver to earn coin');
    // Names the full cost so the courier still sees what a repair would take.
    expect(msg).toContain(`${repairCost(0, 43, T)}c full`);
  });

  it('merely worn at a town does not promise a crawl (the wagon still runs full speed)', () => {
    const msg = repairHelpText({ ...base, atSettlement: true, condition: 20 });
    expect(msg).toContain('Too broke to repair');
    expect(msg).not.toContain('crawls');
    expect(msg).toContain('repair here');
  });

  it('never tells a stranded courier the tow is out of reach, because it cannot be', () => {
    // #432 removed the only path that reached this text off a settlement. The
    // help must not resurrect the old "rescue is out of reach" copy, which is
    // now a lie: the tow charges what the courier has.
    const msg = repairHelpText({ ...base, atSettlement: false, condition: 0 });
    expect(msg).not.toContain('out of reach');
    expect(msg).toContain('Too broke to repair');
  });
});

describe('difficulty presets', () => {
  const marsh = 0.45;

  it('standard is the default profile', () => {
    expect(WAGON_TUNING.standard).toBe(DEFAULT_WAGON_TUNING);
  });

  it('demanding wears faster and starts with a smaller tank than standard', () => {
    expect(wearPerTile(marsh, 0, WAGON_TUNING.demanding)).toBeGreaterThan(
      wearPerTile(marsh, 0, WAGON_TUNING.standard),
    );
    expect(WAGON_TUNING.demanding.startingMaxCondition).toBeLessThan(
      WAGON_TUNING.standard.startingMaxCondition,
    );
  });

  it('charges demanding the standard repair rate, so wear is the whole difficulty', () => {
    // #424: wear, price and tank size all moved against the player at once and
    // compounded to 2.34x coin drain, stranding a careful courier after two
    // regions. The price premium came off; the fragility above stayed. This
    // pins the intent, because a future tuning pass that quietly restores the
    // premium would rebuild the same stack.
    expect(WAGON_TUNING.demanding.costPerPercent).toBe(WAGON_TUNING.standard.costPerPercent);
    expect(repairCost(0, 100, WAGON_TUNING.demanding)).toBe(
      repairCost(0, 100, WAGON_TUNING.standard),
    );
  });

  it('lets demanding limp at the standard rate, so failure is not paid in minutes', () => {
    // #448: the same shape as the repair premium above, one layer down. Slice 5
    // made stranding the normal first lesson on this preset, and at 0.1x the
    // recovery crawl cost more real time than anything else in the game. The
    // fragility is unchanged (wear and tank below); only the price of recovery
    // moved, because failure must be cheap for the soft gate to teach.
    expect(WAGON_TUNING.demanding.limpSpeed).toBe(WAGON_TUNING.standard.limpSpeed);
    expect(limpMultiplier(0, WAGON_TUNING.demanding)).toBe(
      limpMultiplier(0, WAGON_TUNING.standard),
    );
    // Still the hard preset: it breaks just as fast, on a smaller tank.
    expect(wearPerTile(marsh, 0, WAGON_TUNING.demanding)).toBeGreaterThan(
      wearPerTile(marsh, 0, WAGON_TUNING.standard),
    );
    expect(WAGON_TUNING.demanding.startingMaxCondition).toBeLessThan(
      WAGON_TUNING.standard.startingMaxCondition,
    );
  });

  it('relaxed wears slower and costs less than standard', () => {
    expect(wearPerTile(marsh, 0, WAGON_TUNING.relaxed)).toBeLessThan(
      wearPerTile(marsh, 0, WAGON_TUNING.standard),
    );
    expect(repairCost(0, 100, WAGON_TUNING.relaxed)).toBeLessThan(
      repairCost(0, 100, WAGON_TUNING.standard),
    );
  });
});

describe('difficulty selector helpers', () => {
  it('lists the presets easiest to hardest and each has a tuning profile', () => {
    expect(DIFFICULTIES).toEqual(['relaxed', 'standard', 'demanding']);
    for (const d of DIFFICULTIES) {
      expect(WAGON_TUNING[d]).toBeDefined();
    }
  });

  it('recognizes only the known difficulty keys', () => {
    expect(isDifficulty('standard')).toBe(true);
    expect(isDifficulty('relaxed')).toBe(true);
    expect(isDifficulty('demanding')).toBe(true);
    expect(isDifficulty('brutal')).toBe(false);
    expect(isDifficulty(null)).toBe(false);
    expect(isDifficulty(2)).toBe(false);
  });

  it('cycles through every difficulty and wraps hardest back to easiest', () => {
    expect(nextDifficulty('relaxed')).toBe('standard');
    expect(nextDifficulty('standard')).toBe('demanding');
    expect(nextDifficulty('demanding')).toBe('relaxed');
  });

  it('labels a difficulty with a capitalized name', () => {
    expect(difficultyLabel('relaxed')).toBe('Relaxed');
    expect(difficultyLabel('standard')).toBe('Standard');
    expect(difficultyLabel('demanding')).toBe('Demanding');
  });
});

describe('lowConditionWarning', () => {
  // Max 100 puts the low band at (0, 30] (LOW_CONDITION_FRACTION 0.3).
  const MAX = 100;

  it('warns on the first frame in the low band', () => {
    expect(lowConditionWarning(30, MAX, false)).toBe('warn');
  });

  it('holds while low once the warning has fired, so it does not nag', () => {
    expect(lowConditionWarning(20, MAX, true)).toBe('hold');
  });

  it('stays armed through stranding so 0 does not re-fire the toast', () => {
    expect(lowConditionWarning(0, MAX, true)).toBe('hold');
  });

  it('re-arms after a repair lifts the wagon above the low band', () => {
    expect(lowConditionWarning(80, MAX, true)).toBe('rearm');
  });

  it('does nothing while healthy and already armed', () => {
    expect(lowConditionWarning(80, MAX, false)).toBe('hold');
  });

  it('walks a full spell: warn once, hold to stranding, re-arm on repair, warn again', () => {
    // Drop into the low band: warn, then hold all the way down and through 0.
    expect(lowConditionWarning(25, MAX, false)).toBe('warn');
    expect(lowConditionWarning(10, MAX, true)).toBe('hold');
    expect(lowConditionWarning(0, MAX, true)).toBe('hold');
    // Repair back to full: re-arm, then the next low spell warns again.
    expect(lowConditionWarning(MAX, MAX, true)).toBe('rearm');
    expect(lowConditionWarning(30, MAX, false)).toBe('warn');
  });
});
