// Pure world-state model.
//
// A settlement's connection status is derived entirely from delivery history:
// the world reacts to what the courier has actually delivered, so no separate
// saved flag is needed and no save migration either. This is the north star of
// the narrative layer (see docs/decisions/0004-rpg-and-narrative-layer.md):
// deliveries visibly change the world.
//
//   home        the region's home town, where every road begins; always linked
//   silent      a settlement a contract delivers to, not yet delivered
//   reconnected a settlement whose inbound delivery the courier has completed
//
// A settlement that no contract delivers to (and is not home) has no delivery
// that could reconnect it, so it is reported as reconnected (connected/neutral)
// rather than misleadingly silent.

export type SettlementStatus = 'home' | 'silent' | 'reconnected';

export interface WorldStateInput {
  readonly settlements: readonly { readonly id: string }[];
  /** Contracts for the region; a contract reconnects its destination when completed. */
  readonly contracts: readonly { readonly id: string; readonly destinationId: string }[];
  /** The region's home town id. Always reported as 'home'. */
  readonly homeId: string;
  /** Ids of contracts the courier has delivered (global completion history). */
  readonly completedContractIds: readonly string[];
}

/** Status for one settlement, derived from delivery history. */
export function settlementStatus(input: WorldStateInput, settlementId: string): SettlementStatus {
  if (settlementId === input.homeId) {
    return 'home';
  }
  const completed = new Set(input.completedContractIds);
  const inbound = input.contracts.filter((c) => c.destinationId === settlementId);
  if (inbound.length === 0) {
    return 'reconnected';
  }
  return inbound.some((c) => completed.has(c.id)) ? 'reconnected' : 'silent';
}

/** Status for every settlement, keyed by id. */
export function computeWorldState(input: WorldStateInput): Record<string, SettlementStatus> {
  const out: Record<string, SettlementStatus> = {};
  for (const settlement of input.settlements) {
    out[settlement.id] = settlementStatus(input, settlement.id);
  }
  return out;
}

/**
 * Derived story-flag id meaning "this settlement is reconnected". The scene folds
 * one of these into the flags handed to the contract gate for every reconnected
 * place, so second-wave work can require a place to be back on the map. Derived,
 * never persisted, mirroring the other world-state flags.
 */
export function reconnectedFlag(settlementId: string): string {
  return `reconnected_${settlementId}`;
}

// A reconnected place is safer and more grateful, so a further delivery to it
// pays a premium over the flat silent-era rate. This keeps reconnection paying
// off past the first delivery, the gap Session 5 flagged in the later regions
// (see docs/design/06_world_state_remainder.md, Item 2).
export const RECONNECTED_REWARD_BONUS = 0.2;

/**
 * Reward multiplier for a delivery, given the destination's current status.
 * 1.0 for a silent destination (the reconnecting delivery itself) or the home
 * hub; a premium once the destination is already reconnected, so repeat and arc
 * work to a revived place pays better. Pure: derived from world-state, no save.
 */
export function reconnectionRewardMultiplier(
  destinationStatus: SettlementStatus | undefined,
): number {
  return destinationStatus === 'reconnected' ? 1 + RECONNECTED_REWARD_BONUS : 1;
}

// Note: per-status count helpers used to live here but had no production
// caller. The journal's "Reconnected: X / Y" line is NOT the same computation:
// it counts from the masked, discovery-aware view (journal.ts), while helpers
// here would count every settlement, including undiscovered ones and
// no-contract neutral places. Removed in #295; see git history if a HUD
// feature wants them back.
