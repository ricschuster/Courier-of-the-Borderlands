import { describe, it, expect } from 'vitest';
import { deliveryNote, deliveryHeadlineCoins } from '../../src/systems/delivery-text';
import type { DeliveryReward } from '../../src/systems/delivery-reward';

// The delivery line, extracted from MapScene in #392. It had no test at all: six
// conditional fragments around a headline, any of which could have stopped
// appearing without anything noticing.

/** A plain delivery: no standing bonus, no skills, no bonus objective. */
function plainReward(over: Partial<DeliveryReward> = {}): DeliveryReward {
  return {
    baseReward: 60,
    payout: 60,
    skillReward: 0,
    cipherReward: 0,
    bonusCoins: 0,
    total: 60,
    reconnectPremium: false,
    ...over,
  };
}

function note(over: Partial<DeliveryReward> = {}, cargoPayModifier = 1): string {
  return deliveryNote({
    cargo: 'the magistrate\'s writ',
    destinationName: 'Northcairn',
    reputation: 3,
    reward: plainReward(over),
    perkLabel: 'Trusted',
    cargoTag: 'letters',
    cargoPayModifier,
  });
}

describe('deliveryNote', () => {
  it('names the cargo, the place, the coins and the reputation', () => {
    expect(note()).toBe(
      "Delivered the magistrate's writ to Northcairn. Reward: 60 coins, +3 reputation.",
    );
  });

  describe('the standing perk note', () => {
    it('appears only when the standing bonus actually raised the payout', () => {
      expect(note({ payout: 72, total: 72 })).toContain('Reward: 72 coins (Trusted)');
    });

    it('stays away when the payout equals the cargo-adjusted base', () => {
      // The comparison is against baseReward, not the contract's flat reward, so
      // a cargo pay modifier alone must not read as a reputation perk.
      expect(note({ baseReward: 90, payout: 90, total: 90 }, 1.5)).not.toContain('(Trusted)');
    });
  });

  describe('the per-source notes', () => {
    it('reports a Negotiator cut', () => {
      expect(note({ skillReward: 6, total: 66 })).toContain('+6 negotiated.');
    });

    it('reports a Cipher cut', () => {
      expect(note({ cipherReward: 9, total: 69 })).toContain('+9 deciphered.');
    });

    it('reports a met bonus objective', () => {
      expect(note({ bonusCoins: 15, total: 75 })).toContain('Bonus met: +15 coins.');
    });

    it('reports the reconnection premium', () => {
      expect(note({ reconnectPremium: true })).toContain('The reconnected road pays better.');
    });

    it('names the cargo category only when it changes the pay', () => {
      expect(note({}, 1.25)).toContain('Carried as letters.');
      expect(note({}, 1)).not.toContain('Carried as');
    });

    it('says nothing about sources that paid nothing', () => {
      const plain = note();
      expect(plain).not.toContain('negotiated');
      expect(plain).not.toContain('deciphered');
      expect(plain).not.toContain('Bonus met');
      expect(plain).not.toContain('reconnected road');
    });
  });

  describe('the headline number', () => {
    it('sums the payout, the Negotiator cut and the Cipher cut', () => {
      expect(deliveryHeadlineCoins(plainReward({ payout: 70, skillReward: 7, cipherReward: 3 }))).toBe(80);
    });

    // Deliberate: the bonus gets its own sentence so the player can see what it
    // was worth alone. The ledger receives reward.total, which does include it,
    // so the headline is not the amount banked.
    it('excludes the bonus objective, which is reported separately', () => {
      const reward = plainReward({ payout: 60, bonusCoins: 15, total: 75 });

      expect(deliveryHeadlineCoins(reward)).toBe(60);
      const line = deliveryNote({
        cargo: 'grain',
        destinationName: 'Southmill',
        reputation: 2,
        reward,
        perkLabel: 'Trusted',
        cargoTag: 'goods',
        cargoPayModifier: 1,
      });
      expect(line).toContain('Reward: 60 coins');
      expect(line).toContain('Bonus met: +15 coins.');
    });
  });

  it('reads correctly with every source paying at once', () => {
    expect(
      note({
        baseReward: 60,
        payout: 72,
        skillReward: 7,
        cipherReward: 10,
        bonusCoins: 15,
        total: 104,
        reconnectPremium: true,
      }, 1.5),
    ).toBe(
      "Delivered the magistrate's writ to Northcairn. Reward: 89 coins (Trusted), " +
        '+3 reputation. +7 negotiated. +10 deciphered. Bonus met: +15 coins. ' +
        'Carried as letters. The reconnected road pays better.',
    );
  });
});
