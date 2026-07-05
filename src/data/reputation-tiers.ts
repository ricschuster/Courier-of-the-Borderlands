// Reputation tier definitions, ordered ascending by minReputation.
export interface ReputationTier {
  readonly name: string;
  readonly minReputation: number;
}

export const REPUTATION_TIERS: readonly ReputationTier[] = [
  { name: 'Stranger', minReputation: 0 },
  { name: 'Known', minReputation: 3 },
  { name: 'Trusted', minReputation: 8 },
  { name: 'Honoured', minReputation: 15 },
];
