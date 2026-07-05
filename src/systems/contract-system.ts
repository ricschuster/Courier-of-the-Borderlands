// Pure contract logic. No Phaser here so it can be unit tested directly.
//
// A delivery moves through three states: the courier accepts a contract, picks
// up the cargo at its pickup settlement, then delivers it at its destination.

import type { CargoCategoryId } from './cargo-types';

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
}

export interface ContractProgress {
  readonly contractId: string;
  readonly status: ContractStatus;
}

export function startContract(contract: Contract): ContractProgress {
  return { contractId: contract.id, status: 'accepted' };
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
