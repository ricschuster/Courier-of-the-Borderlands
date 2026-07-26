// The line the event log shows when a delivery lands.
//
// Extracted from MapScene.completeDelivery in #392. It is six conditional
// fragments assembled around a headline, and nothing tested any of them: a
// delivery that quietly stopped mentioning the Negotiator cut, or that named the
// wrong number, would have shipped silently.
//
// Pure: no Phaser, no scene. The reward itself is already composed in
// delivery-reward.ts; this only says it out loud.

import type { DeliveryReward } from './delivery-reward';

export interface DeliveryNoteInput {
  /** Cargo as it reads in prose, e.g. "the magistrate's writ". */
  readonly cargo: string;
  readonly destinationName: string;
  /** Reputation the contract pays the destination. */
  readonly reputation: number;
  readonly reward: DeliveryReward;
  /** Standing tier label, shown only when the standing bonus actually paid. */
  readonly perkLabel: string;
  /** Cargo category tag, e.g. "secrets". */
  readonly cargoTag: string;
  /** Cargo pay modifier; 1 means ordinary cargo and earns no note. */
  readonly cargoPayModifier: number;
}

/**
 * Coins named in the headline.
 *
 * Deliberately excludes the bonus objective, which gets its own sentence so the
 * player can see what the bonus was worth on its own. The ledger still receives
 * `reward.total`, which includes it, so the headline is not the amount banked.
 */
export function deliveryHeadlineCoins(reward: DeliveryReward): number {
  return reward.payout + reward.skillReward + reward.cipherReward;
}

/** The full event-log line for a completed delivery. */
export function deliveryNote(input: DeliveryNoteInput): string {
  const { reward } = input;

  // The perk note compares against the cargo-adjusted base, so it reflects a
  // reputation boost rather than the cargo pay modifier.
  const perkNote = reward.payout > reward.baseReward ? ` (${input.perkLabel})` : '';
  const skillNote = reward.skillReward > 0 ? ` +${reward.skillReward} negotiated.` : '';
  const cipherNote = reward.cipherReward > 0 ? ` +${reward.cipherReward} deciphered.` : '';
  const bonusNote = reward.bonusCoins > 0 ? ` Bonus met: +${reward.bonusCoins} coins.` : '';
  const cargoNote = input.cargoPayModifier !== 1 ? ` Carried as ${input.cargoTag}.` : '';
  const reconnectNote = reward.reconnectPremium ? ' The reconnected road pays better.' : '';

  return (
    `Delivered ${input.cargo} to ${input.destinationName}. ` +
    `Reward: ${deliveryHeadlineCoins(reward)} coins${perkNote}, ` +
    `+${input.reputation} reputation.${skillNote}${cipherNote}${bonusNote}${cargoNote}${reconnectNote}`
  );
}
