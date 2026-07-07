// Pure contract logic. No Phaser here so it can be unit tested directly.
//
// A delivery moves through three states: the courier accepts a contract, picks
// up the cargo at its pickup settlement, then delivers it at its destination.

import type { CargoCategoryId } from './cargo-types';
import { conditionMet, type FlagCondition, type StoryFlags } from './dialogue';

export type ContractStatus = 'accepted' | 'carrying' | 'delivered';

export interface Contract {
  readonly id: string;
  readonly title: string;
  readonly cargo: string;
  /** Settlement id where the cargo is collected. */
  readonly pickupId: string;
  /** Settlement id where the cargo is delivered. */
  readonly destinationId: string;
  /** Currency paid on delivery. */
  readonly reward: number;
  /** Reputation gained on delivery. */
  readonly reputation: number;
  /** Minimum total reputation required to accept this contract. */
  readonly minReputation: number;
  /** Short story flavour for the delivery. */
  readonly note: string;
  /** Cargo category driving the pay modifier. Falls back to the default when omitted. */
  readonly cargoType?: CargoCategoryId;
  /**
   * Optional story-flag gate on the contract appearing at all. Omitted means the
   * contract is always available (a standing route). When present, the contract
   * is hidden from the board until the flags satisfy the condition, so the arc
   * can open new work as the world reconnects (world-state consequence, ADR
   * 0004). Gated contracts are excluded from progress counts until revealed, so
   * the board never shows "one you cannot see".
   */
  readonly requires?: FlagCondition;
}

export interface ContractProgress {
  readonly contractId: string;
  readonly status: ContractStatus;
}

export function startContract(contract: Contract): ContractProgress {
  return { contractId: contract.id, status: 'accepted' };
}

/**
 * True when a contract can appear on the board: it is not already completed and
 * its optional story-flag gate is satisfied. An ungated contract is available
 * whenever it is not completed.
 */
export function isContractAvailable(
  contract: Contract,
  completedIds: ReadonlySet<string>,
  flags: StoryFlags,
): boolean {
  return !completedIds.has(contract.id) && conditionMet(flags, contract.requires);
}

/** The contracts currently offerable on the board, in authored order. */
export function availableContracts(
  contracts: readonly Contract[],
  completedIds: ReadonlySet<string>,
  flags: StoryFlags,
): Contract[] {
  return contracts.filter((c) => isContractAvailable(c, completedIds, flags));
}

/**
 * Contracts that count toward region progress: those completed, plus those
 * currently available. A gated contract that has not been revealed yet is
 * excluded, so "N of M delivered" only ever counts work the courier can see or
 * has already done, and M grows as the arc opens new contracts.
 */
export function contractsInPlay(
  contracts: readonly Contract[],
  completedIds: ReadonlySet<string>,
  flags: StoryFlags,
): Contract[] {
  return contracts.filter((c) => completedIds.has(c.id) || conditionMet(flags, c.requires));
}

/** Contracts with no story-flag gate: the region's standing routes. */
export function baseContracts(contracts: readonly Contract[]): Contract[] {
  return contracts.filter((c) => c.requires === undefined);
}

/** True when the courier's reputation is high enough to accept the contract. */
export function canAccept(contract: Contract, reputation: number): boolean {
  return reputation >= contract.minReputation;
}

/** True when the courier can collect the cargo at the given settlement. */
export function canPickUp(
  progress: ContractProgress,
  contract: Contract,
  settlementId: string,
): boolean {
  return progress.status === 'accepted' && settlementId === contract.pickupId;
}

/** True when the courier can deliver the cargo at the given settlement. */
export function canDeliver(
  progress: ContractProgress,
  contract: Contract,
  settlementId: string,
): boolean {
  return progress.status === 'carrying' && settlementId === contract.destinationId;
}

/** Advance to carrying. No-op unless the contract is currently accepted. */
export function pickUp(progress: ContractProgress): ContractProgress {
  if (progress.status !== 'accepted') {
    return progress;
  }
  return { ...progress, status: 'carrying' };
}

/** Advance to delivered. No-op unless the contract is currently carrying. */
export function deliver(progress: ContractProgress): ContractProgress {
  if (progress.status !== 'carrying') {
    return progress;
  }
  return { ...progress, status: 'delivered' };
}

export function isDelivered(progress: ContractProgress): boolean {
  return progress.status === 'delivered';
}
