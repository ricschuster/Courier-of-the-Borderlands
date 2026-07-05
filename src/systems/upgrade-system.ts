// upgrade-system.ts
// Pure logic for vehicle upgrades: purchasing, affordability, and speed calculations.

export interface Upgrade {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly cost: number;       // coins
  readonly speedBonus: number; // fraction, e.g. 0.25 means +25% speed
}

/**
 * Returns the total speed multiplier for the player's vehicle.
 * Base is 1.0; each purchased upgrade adds its speedBonus.
 * Unknown ids in purchasedIds are silently ignored.
 */
export function speedMultiplier(
  purchasedIds: ReadonlySet<string>,
  upgrades: readonly Upgrade[],
): number {
  let bonus = 0;
  for (const upgrade of upgrades) {
    if (purchasedIds.has(upgrade.id)) {
      bonus += upgrade.speedBonus;
    }
  }
  return 1 + bonus;
}

/** Returns true if the given upgrade id is in the purchased set. */
export function isPurchased(purchasedIds: ReadonlySet<string>, id: string): boolean {
  return purchasedIds.has(id);
}

/** Returns true if the player has enough coins to buy the upgrade. */
export function canAfford(coins: number, upgrade: Upgrade): boolean {
  return coins >= upgrade.cost;
}

/** Result of a purchase attempt. On failure ok is false and state is unchanged. */
export interface PurchaseResult {
  readonly ok: boolean;
  readonly coins: number;
  readonly purchased: ReadonlySet<string>;
}

/**
 * Attempts to purchase an upgrade.
 * Fails (ok: false, state unchanged) if already owned or not affordable.
 * On success returns a new set and reduced coin total; the input set is never mutated.
 */
export function purchase(
  purchasedIds: ReadonlySet<string>,
  coins: number,
  upgrade: Upgrade,
): PurchaseResult {
  if (isPurchased(purchasedIds, upgrade.id) || !canAfford(coins, upgrade)) {
    return { ok: false, coins, purchased: purchasedIds };
  }

  const next = new Set(purchasedIds);
  next.add(upgrade.id);

  return {
    ok: true,
    coins: coins - upgrade.cost,
    purchased: next,
  };
}
