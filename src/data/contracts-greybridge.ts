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
    minReputation: 0,
    note: 'The Greywater postmaster presses a bundle of sealed letters into your hands. Eastwatch has gone quiet, and quiet is rarely good.',
  },
  {
    id: 'grain-to-southmill',
    title: 'Grain for Southmill',
    cargo: 'sacks of grain',
    pickupId: 'greywater',
    destinationId: 'southmill',
    reward: 70,
    reputation: 3,
    minReputation: 2,
    note: 'Southmill has not answered for a season. Take them grain, and see why the wheels have stopped.',
  },
  {
    id: 'rumours-to-ironhollow',
    title: 'A Rumour for Ironhollow',
    cargo: 'a whispered rumour',
    pickupId: 'greywater',
    destinationId: 'ironhollow',
    reward: 60,
    reputation: 2,
    minReputation: 4,
    note: 'A hooded traveller pays you to carry a single sentence to Ironhollow. Do not read it, they say. You already have.',
  },
];
