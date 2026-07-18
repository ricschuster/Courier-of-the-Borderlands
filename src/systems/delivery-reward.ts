// Pure composition of a delivery's reward (#301). The individual pieces
// (cargo payout, reconnection premium, standing bonus, Negotiator skill,
// contract bonus) are pure modules already; what this module owns is their
// ORDER, a real game rule that previously lived only inside the scene's
// completeDelivery and had no end-to-end unit test:
//
//   1. the cargo pay modifier scales the contract's base reward (rounded)
//   2. the reconnection premium multiplies that, rounded to whole coins
//   3. the standing (reputation) bonus applies to the result
//   4. the Negotiator skill fraction is computed off the standing-boosted
//      payout, rounded
//   5. the Cipher rider adds its fraction off the same boosted payout on a
//      secrets delivery, rounded
//   6. a met bonus objective adds its flat coins last
//
//   total = payout + skillReward + cipherReward + bonusCoins

import { cargoPayout, type CargoCategoryId } from './cargo-types';
import { reconnectionRewardMultiplier } from './world-state';
import type { SettlementStatus } from './world-state';
import { applyRewardBonus } from './reputation-perks';
import { skillRewardBonus, cipherSecretsBonus, type SkillRanks } from './skills';
import { bonusFor, bonusAchieved, type BonusFacts } from './contract-bonus';

export interface DeliveryRewardInput {
  readonly contractId: string;
  /** The contract's flat reward, before any modifier. */
  readonly contractReward: number;
  readonly cargoType: CargoCategoryId | undefined;
  /**
   * Destination status read BEFORE the contract is marked completed, so the
   * delivery that first reconnects a place pays the flat rate and only later
   * work to it earns the premium.
   */
  readonly destinationStatus: SettlementStatus | undefined;
  /** Total reputation across settlements, for the standing bonus. */
  readonly totalReputation: number;
  readonly skills: SkillRanks;
  /** What actually happened on this run, for the optional bonus objective. */
  readonly bonusFacts: BonusFacts;
}

export interface DeliveryReward {
  /** Cargo-adjusted, reconnect-adjusted base, before the standing bonus. */
  readonly baseReward: number;
  /**
   * Standing-boosted payout, the headline number. Compare against baseReward
   * to tell whether the standing bonus actually raised it (the perk note).
   */
  readonly payout: number;
  /** The Negotiator skill's cut, computed off the boosted payout. */
  readonly skillReward: number;
  /** The Cipher rider's cut on a secrets delivery, 0 otherwise. */
  readonly cipherReward: number;
  /** Flat coins from a met bonus objective, 0 otherwise. */
  readonly bonusCoins: number;
  /** Coins to add to the ledger: payout + skillReward + cipherReward + bonusCoins. */
  readonly total: number;
  /** Whether the reconnection premium applied (for the event-log note). */
  readonly reconnectPremium: boolean;
}

/** Compose a delivery's full reward from the contract and run state. */
export function computeDeliveryReward(input: DeliveryRewardInput): DeliveryReward {
  const reconnectMult = reconnectionRewardMultiplier(input.destinationStatus);
  const baseReward = Math.round(
    cargoPayout(input.contractReward, input.cargoType) * reconnectMult,
  );
  const payout = applyRewardBonus(baseReward, input.totalReputation);
  const skillReward = Math.round(payout * skillRewardBonus(input.skills));
  const cipherReward = Math.round(payout * cipherSecretsBonus(input.skills, input.cargoType));
  const bonus = bonusFor(input.contractId);
  const bonusCoins =
    bonus !== undefined && bonusAchieved(bonus, input.bonusFacts) ? bonus.reward : 0;
  return {
    baseReward,
    payout,
    skillReward,
    cipherReward,
    bonusCoins,
    total: payout + skillReward + cipherReward + bonusCoins,
    reconnectPremium: reconnectMult > 1,
  };
}
