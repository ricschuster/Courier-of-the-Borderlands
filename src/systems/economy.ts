// Pure, immutable ledger tracking coins and per-settlement reputation.
import type { ReputationTier } from '../data/reputation-tiers';
import { REPUTATION_TIERS } from '../data/reputation-tiers';

export interface Ledger {
  readonly coins: number;
  readonly reputation: Readonly<Record<string, number>>; // settlementId -> reputation
}

/** Create a new ledger, optionally with starting coins (defaults to 0). */
export function createLedger(startingCoins: number = 0): Ledger {
  return { coins: Math.max(0, startingCoins), reputation: {} };
}

/** Rebuild a ledger from saved values (coins clamped to >= 0; reputation copied). */
export function ledgerFrom(coins: number, reputation: Readonly<Record<string, number>>): Ledger {
  return { coins: Math.max(0, coins), reputation: { ...reputation } };
}

/** Return a new ledger with coins adjusted by amount. Result is clamped to >= 0. */
export function addCoins(ledger: Ledger, amount: number): Ledger {
  return { ...ledger, coins: Math.max(0, ledger.coins + amount) };
}

/** Return a new ledger with the given settlement's reputation adjusted by amount. Clamped to >= 0. */
export function addReputation(ledger: Ledger, settlementId: string, amount: number): Ledger {
  const current = ledger.reputation[settlementId] ?? 0;
  const updated = Math.max(0, current + amount);
  return {
    ...ledger,
    reputation: { ...ledger.reputation, [settlementId]: updated },
  };
}

/** Return the reputation with a given settlement, or 0 if none recorded. */
export function reputationWith(ledger: Ledger, settlementId: string): number {
  return ledger.reputation[settlementId] ?? 0;
}

/** Return the sum of reputation across all settlements. */
export function totalReputation(ledger: Ledger): number {
  return Object.values(ledger.reputation).reduce((sum, val) => sum + val, 0);
}

/**
 * Return the highest tier whose minReputation is <= the given value.
 * REPUTATION_TIERS[0] is the floor; the array is never empty.
 */
export function tierFor(reputation: number): ReputationTier {
  let result: ReputationTier | undefined;
  for (const tier of REPUTATION_TIERS) {
    if (tier.minReputation <= reputation) {
      result = tier;
    }
  }
  // REPUTATION_TIERS[0].minReputation is 0, so a non-negative input always matches at least one tier.
  // For safety, fall back to the first tier if result is somehow undefined.
  const first = REPUTATION_TIERS[0];
  if (first === undefined) {
    throw new Error('REPUTATION_TIERS must not be empty');
  }
  return result ?? first;
}
