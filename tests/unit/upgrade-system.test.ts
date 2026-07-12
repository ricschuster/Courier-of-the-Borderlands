import { describe, it, expect } from 'vitest';
import {
  speedMultiplier,
  isPurchased,
  canAfford,
  purchase,
  revealRadius,
  cheapestUnpurchased,
  terrainSpeedFactor,
  upgradeEffectLabel,
} from '../../src/systems/upgrade-system';
import type { Upgrade } from '../../src/systems/upgrade-system';
import { UPGRADES_GREYBRIDGE } from '../../src/data/upgrades-greybridge';

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

// The upgrade menu is bought by number key: item [i] is fitted by pressing the
// (i+1)th number key registered in map-scene (numberCodes). That list currently
// runs 1..9. If the shop ever grows past it, the trailing upgrades render in the
// menu but have no key to buy them (this is exactly how Salt Runners [7] was
// unbuyable while numberCodes stopped at SIX). Keep numberCodes long enough to
// cover every shop entry.
const NUMBER_KEY_BUDGET = 9;

describe('Greybridge upgrade shop', () => {
  it('fits within the number-key budget so every upgrade is buyable', () => {
    expect(UPGRADES_GREYBRIDGE.length).toBeLessThanOrEqual(NUMBER_KEY_BUDGET);
  });
});

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

// ---------------------------------------------------------------------------
// terrainSpeedFactor
// ---------------------------------------------------------------------------
describe('terrainSpeedFactor', () => {
  // Local fixture: an upgrade that grants 50% roughness relief.
  const SPRUNG: Upgrade = {
    id: 'sprung-axle',
    name: 'Sprung Axle',
    description: 'Eases the slog through rough terrain.',
    cost: 60,
    speedBonus: 0,
    roughnessRelief: 0.5,
  };

  // A second relief upgrade used for the clamping test.
  const CUSHION: Upgrade = {
    id: 'cushion-mounts',
    name: 'Cushion Mounts',
    description: 'Extra cushioning for rough terrain.',
    cost: 50,
    speedBonus: 0,
    roughnessRelief: 0.8,
  };

  const RELIEF_UPGRADES: readonly Upgrade[] = [SPRUNG, CUSHION];

  it('returns baseTerrainModifier unchanged when it is exactly 1', () => {
    expect(terrainSpeedFactor(1, new Set(['sprung-axle']), RELIEF_UPGRADES)).toBe(1);
  });

  it('returns baseTerrainModifier unchanged when it exceeds 1 (e.g. road bonus)', () => {
    expect(terrainSpeedFactor(1.2, new Set(['sprung-axle']), RELIEF_UPGRADES)).toBe(1.2);
  });

  it('lifts a slow modifier (0.5) correctly when the relief upgrade is purchased', () => {
    // relief = 0.5; result = 0.5 + (1 - 0.5) * 0.5 = 0.75
    expect(
      terrainSpeedFactor(0.5, new Set(['sprung-axle']), RELIEF_UPGRADES),
    ).toBeCloseTo(0.75);
  });

  it('leaves a slow modifier unchanged when no relief upgrade is purchased', () => {
    expect(terrainSpeedFactor(0.5, new Set(), RELIEF_UPGRADES)).toBeCloseTo(0.5);
  });

  it('leaves a slow modifier unchanged when a non-relief upgrade is purchased', () => {
    // WHEEL_UPGRADE has no roughnessRelief field.
    const upgrades: readonly Upgrade[] = [WHEEL_UPGRADE, SPRUNG];
    expect(
      terrainSpeedFactor(0.4, new Set(['reinforced-wheels']), upgrades),
    ).toBeCloseTo(0.4);
  });

  it('clamps combined relief to 1 so output never exceeds 1.0 for a slow input', () => {
    // SPRUNG (0.5) + CUSHION (0.8) = 1.3, clamped to 1.0
    // result = 0.5 + (1 - 0.5) * 1.0 = 1.0
    const purchased = new Set(['sprung-axle', 'cushion-mounts']);
    expect(terrainSpeedFactor(0.5, purchased, RELIEF_UPGRADES)).toBeCloseTo(1.0);
  });
});

describe('upgradeEffectLabel', () => {
  it('summarises a speed upgrade', () => {
    expect(upgradeEffectLabel(WHEEL_UPGRADE)).toBe('+25% speed');
  });

  it('summarises a reveal upgrade with a fractional tile count', () => {
    expect(
      upgradeEffectLabel({
        id: 'far-lantern',
        name: 'Far Lantern',
        description: '',
        cost: 40,
        speedBonus: 0,
        revealBonus: 1.5,
      }),
    ).toBe('+1.5 tiles sight');
  });

  it('summarises a roughness-relief upgrade', () => {
    expect(
      upgradeEffectLabel({
        id: 'sprung-axle',
        name: 'Sprung Axle',
        description: '',
        cost: 60,
        speedBonus: 0,
        roughnessRelief: 0.5,
      }),
    ).toBe('-50% rough-ground drag');
  });

  it('joins multiple effects', () => {
    expect(
      upgradeEffectLabel({
        id: 'combo',
        name: 'Combo',
        description: '',
        cost: 100,
        speedBonus: 0.25,
        revealBonus: 2,
        roughnessRelief: 0.5,
      }),
    ).toBe('+25% speed, +2 tiles sight, -50% rough-ground drag');
  });

  it('falls back when an upgrade has no direct stat effect', () => {
    expect(
      upgradeEffectLabel({ id: 'x', name: 'X', description: '', cost: 10, speedBonus: 0 }),
    ).toBe('no direct effect');
  });
});
