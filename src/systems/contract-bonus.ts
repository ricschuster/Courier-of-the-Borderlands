// Pure logic for optional per-contract bonus objectives.
// Bonuses are keyed by contract id so no other file needs to change.

export type BonusKind = 'via-ford' | 'swift';

export interface ContractBonus {
  readonly kind: BonusKind;
  readonly reward: number;        // extra coins on success
  readonly description: string;   // shown on the board
  readonly maxTiles?: number;     // for 'swift': the distance budget in tiles
}

export interface BonusFacts {
  readonly usedFord: boolean;     // the river was crossed at the ford during this contract
  readonly tilesDriven: number;   // tiles driven since the contract was accepted
}

/**
 * Bonus objectives keyed by contract id. Contracts without an entry have no bonus.
 *
 * Tile budgets are set against the shortest route on the current 30x22 map plus
 * a small slack, so a direct run earns the bonus but a meandering one does not.
 * The via-ford bonus lives on the run the ford actually shortens: the Ironhollow
 * to Mirewatch leg crosses the river, and the ford is the short way over.
 */
export const CONTRACT_BONUSES: Readonly<Record<string, ContractBonus>> = {
  'grain-to-southmill': {
    kind: 'swift',
    reward: 25,
    maxTiles: 28, // shortest Greywater -> Southmill is 25 tiles
    description: 'Deliver swiftly, within 28 tiles driven',
  },
  'rumours-to-ironhollow': {
    kind: 'swift',
    reward: 20,
    maxTiles: 17, // shortest Greywater -> Ironhollow is 14 tiles
    description: 'Deliver swiftly, within 17 tiles driven',
  },
  'secret-to-mirewatch': {
    kind: 'via-ford',
    reward: 30,
    description: 'Cross the river at the ford',
  },
};

/** Return the bonus for a contract, or undefined if none exists. */
export function bonusFor(contractId: string): ContractBonus | undefined {
  return CONTRACT_BONUSES[contractId];
}

/** Return true when the player has satisfied the bonus conditions. */
export function bonusAchieved(bonus: ContractBonus, facts: BonusFacts): boolean {
  if (bonus.kind === 'via-ford') {
    return facts.usedFord;
  }
  // 'swift': tiles driven must be within the budget (absent maxTiles means unlimited)
  return facts.tilesDriven <= (bonus.maxTiles ?? Infinity);
}

/** Return a short human-readable label for display on the contract board. */
export function describeBonus(bonus: ContractBonus): string {
  return `Bonus: ${bonus.description} (+${bonus.reward}c)`;
}
