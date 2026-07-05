import { describe, it, expect } from 'vitest';
import {
  speedMultiplier,
  isPurchased,
  canAfford,
  purchase,
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
