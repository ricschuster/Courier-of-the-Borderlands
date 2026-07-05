import { describe, it, expect } from 'vitest';
import {
  speedMultiplier,
  isPurchased,
  canAfford,
  purchase,
  revealRadius,
  cheapestUnpurchased,
} from '../../src/systems/upgrade-system';
import type { Upgrade } from '../../src/systems/upgrade-system';

// Small fixture used across all tests.
const WHEEL_UPGRADE: Upgrade = {
  id: 'reinforced-wheels',
  name: 'Reinforced Wheels',
  description: 'Sturdier wheels for rough terrain.',
  cost: 50,
  speedBonus: 0.25,
};

const AXLE_UPGRADE: Upgrade = {
  id: 'iron-axle',
  name: 'Iron Axle',
  description: 'Heavier axle for stability.',
  cost: 75,
  speedBonus: 0.15,
};

// Fixture with a revealBonus for revealRadius tests.
const LANTERN_UPGRADE: Upgrade = {
  id: 'far-lantern',
  name: 'Far Lantern',
  description: 'A brighter lantern reveals more of the road ahead.',
  cost: 40,
  speedBonus: 0,
  revealBonus: 1.5,
};

const ALL_UPGRADES: readonly Upgrade[] = [WHEEL_UPGRADE, AXLE_UPGRADE];

// ---------------------------------------------------------------------------
// speedMultiplier
// ---------------------------------------------------------------------------
describe('speedMultiplier', () => {
  it('returns 1 when nothing is purchased', () => {
    expect(speedMultiplier(new Set(), ALL_UPGRADES)).toBe(1);
  });

  it('returns 1.25 when only reinforced-wheels is purchased', () => {
    expect(speedMultiplier(new Set(['reinforced-wheels']), ALL_UPGRADES)).toBe(1.25);
  });

  it('sums bonuses when both upgrades are purchased', () => {
    const purchased = new Set(['reinforced-wheels', 'iron-axle']);
    // 1 + 0.25 + 0.15 = 1.40
    expect(speedMultiplier(purchased, ALL_UPGRADES)).toBeCloseTo(1.4);
  });

  it('ignores unknown ids that are not in the upgrades list', () => {
    const purchased = new Set(['unknown-upgrade']);
    expect(speedMultiplier(purchased, ALL_UPGRADES)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// isPurchased
// ---------------------------------------------------------------------------
describe('isPurchased', () => {
  it('returns true when the id is in the set', () => {
    expect(isPurchased(new Set(['reinforced-wheels']), 'reinforced-wheels')).toBe(true);
  });

  it('returns false when the id is not in the set', () => {
    expect(isPurchased(new Set(), 'reinforced-wheels')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canAfford
// ---------------------------------------------------------------------------
describe('canAfford', () => {
  it('returns true when coins equal the cost', () => {
    expect(canAfford(50, WHEEL_UPGRADE)).toBe(true);
  });

  it('returns true when coins exceed the cost', () => {
    expect(canAfford(100, WHEEL_UPGRADE)).toBe(true);
  });

  it('returns false when coins are below the cost', () => {
    expect(canAfford(49, WHEEL_UPGRADE)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// purchase
// ---------------------------------------------------------------------------
describe('purchase', () => {
  it('succeeds when affordable and not yet owned', () => {
    const result = purchase(new Set(), 100, WHEEL_UPGRADE);

    expect(result.ok).toBe(true);
    expect(result.coins).toBe(50);
    expect(result.purchased.has('reinforced-wheels')).toBe(true);
  });

  it('deducts the exact upgrade cost from coins', () => {
    const result = purchase(new Set(), 50, WHEEL_UPGRADE);

    expect(result.ok).toBe(true);
    expect(result.coins).toBe(0);
  });

  it('fails when the upgrade is already owned', () => {
    const owned = new Set(['reinforced-wheels']);
    const result = purchase(owned, 200, WHEEL_UPGRADE);

    expect(result.ok).toBe(false);
    expect(result.coins).toBe(200);
    expect(result.purchased).toBe(owned); // same reference -- unchanged
  });

  it('fails when the player cannot afford the upgrade', () => {
    const result = purchase(new Set(), 10, WHEEL_UPGRADE);

    expect(result.ok).toBe(false);
    expect(result.coins).toBe(10);
    expect(result.purchased.has('reinforced-wheels')).toBe(false);
  });

  it('does not mutate the original purchased set', () => {
    const original = new Set<string>();
    purchase(original, 100, WHEEL_UPGRADE);

    expect(original.size).toBe(0);
  });

  it('preserves previously purchased upgrades in the new set', () => {
    const existing = new Set(['iron-axle']);
    const result = purchase(existing, 100, WHEEL_UPGRADE);

    expect(result.ok).toBe(true);
    expect(result.purchased.has('iron-axle')).toBe(true);
    expect(result.purchased.has('reinforced-wheels')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// revealRadius
// ---------------------------------------------------------------------------
describe('revealRadius', () => {
  const REVEAL_UPGRADES: readonly Upgrade[] = [WHEEL_UPGRADE, LANTERN_UPGRADE];

  it('returns baseRadius when nothing is purchased', () => {
    expect(revealRadius(new Set(), REVEAL_UPGRADES, 3)).toBe(3);
  });

  it('adds revealBonus of a purchased upgrade to baseRadius', () => {
    expect(revealRadius(new Set(['far-lantern']), REVEAL_UPGRADES, 3)).toBeCloseTo(4.5);
  });

  it('treats absent revealBonus as 0 (no change to baseRadius)', () => {
    // WHEEL_UPGRADE has no revealBonus field.
    expect(revealRadius(new Set(['reinforced-wheels']), REVEAL_UPGRADES, 3)).toBe(3);
  });

  it('sums revealBonus across multiple purchased upgrades with the field', () => {
    const extra: Upgrade = {
      id: 'signal-torch',
      name: 'Signal Torch',
      description: 'An extra torch for wider reveal.',
      cost: 30,
      speedBonus: 0,
      revealBonus: 0.5,
    };
    const upgrades: readonly Upgrade[] = [LANTERN_UPGRADE, extra];
    expect(revealRadius(new Set(['far-lantern', 'signal-torch']), upgrades, 2)).toBeCloseTo(4);
  });
});

// ---------------------------------------------------------------------------
// cheapestUnpurchased
// ---------------------------------------------------------------------------
describe('cheapestUnpurchased', () => {
  // Local fixture: costs 30, 50, 75.
  const CHEAP: Upgrade = {
    id: 'cheap-bag',
    name: 'Cheap Bag',
    description: 'A small saddlebag.',
    cost: 30,
    speedBonus: 0,
  };
  const FIXTURE: readonly Upgrade[] = [WHEEL_UPGRADE, AXLE_UPGRADE, CHEAP];

  it('returns the upgrade with the lowest cost when nothing is owned', () => {
    const result = cheapestUnpurchased(new Set(), FIXTURE);
    expect(result?.id).toBe('cheap-bag');
  });

  it('skips already-owned upgrades', () => {
    const result = cheapestUnpurchased(new Set(['cheap-bag']), FIXTURE);
    expect(result?.id).toBe('reinforced-wheels');
  });

  it('returns null when all upgrades are owned', () => {
    const owned = new Set(['reinforced-wheels', 'iron-axle', 'cheap-bag']);
    expect(cheapestUnpurchased(owned, FIXTURE)).toBeNull();
  });

  it('breaks ties by array order (first occurrence wins)', () => {
    const tied: readonly Upgrade[] = [
      { id: 'first', name: 'First', description: '', cost: 20, speedBonus: 0 },
      { id: 'second', name: 'Second', description: '', cost: 20, speedBonus: 0 },
    ];
    const result = cheapestUnpurchased(new Set(), tied);
    expect(result?.id).toBe('first');
  });

  it('returns null for an empty upgrades array', () => {
    expect(cheapestUnpurchased(new Set(), [])).toBeNull();
  });
});
