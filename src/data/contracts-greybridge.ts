// Delivery contracts for the Greybridge Region. Typed module for now; easy to
// migrate to JSON later. Additional contracts arrive in a later build step.
import type { Contract } from '../systems/contract-system';

export const CONTRACTS_GREYBRIDGE: readonly Contract[] = [
  {
    id: 'letters-to-eastwatch',
    title: 'Letters to Eastwatch',
    cargo: 'sealed letters',
    pickupId: 'greywater',
    destinationId: 'eastwatch',
    reward: 50,
    reputation: 2,
    note: 'The Greywater postmaster presses a bundle of sealed letters into your hands. Eastwatch has gone quiet, and quiet is rarely good.',
  },
];
