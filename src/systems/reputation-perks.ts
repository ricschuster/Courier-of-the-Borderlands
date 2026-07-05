// Pure module: maps total courier reputation to delivery reward multipliers.
// No Phaser imports. No economy or reputation-tier module imports.

export interface RewardPerk {
  readonly minReputation: number; // ascending threshold
  readonly rewardMultiplier: number;
  readonly label: string; // e.g. "standard rates"
}

// Sorted ascending by minReputation. First entry is the floor (rep 0, multiplier 1).
export const REWARD_PERKS: readonly RewardPerk[] = [
  { minReputation: 0, rewardMultiplier: 1, label: 'standard rates' },
  { minReputation: 3, rewardMultiplier: 1.1, label: 'favoured rates' },
  { minReputation: 8, rewardMultiplier: 1.25, label: 'trusted rates' },
  { minReputation: 15, rewardMultiplier: 1.5, label: 'honoured rates' },
];

/**
 * Return the highest perk whose minReputation is <= reputation.
 * Always returns a valid perk because REWARD_PERKS[0] is the floor at 0.
 */
export function perkFor(reputation: number): RewardPerk {
  // Walk backwards to find the highest qualifying perk.
  for (let i = REWARD_PERKS.length - 1; i >= 0; i--) {
    const perk: RewardPerk | undefined = REWARD_PERKS[i];
    if (perk !== undefined && perk.minReputation <= reputation) {
      return perk;
    }
  }
  // Explicit fallback: guard against an empty array (should not happen at runtime).
  const floor: RewardPerk | undefined = REWARD_PERKS[0];
  if (floor === undefined) {
    // Provide a safe default so the function always returns a RewardPerk.
    return { minReputation: 0, rewardMultiplier: 1, label: 'standard rates' };
  }
  return floor;
}

/** Return the rewardMultiplier for the active perk at the given reputation. */
export function rewardMultiplier(reputation: number): number {
  return perkFor(reputation).rewardMultiplier;
}

/**
 * Calculate final delivery coins.
 * Result is Math.round(baseReward * multiplier), and is never below baseReward.
 */
export function applyRewardBonus(baseReward: number, reputation: number): number {
  const multiplied = Math.round(baseReward * rewardMultiplier(reputation));
  return Math.max(baseReward, multiplied);
}
