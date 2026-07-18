import { describe, it, expect } from 'vitest';
import { computeDeliveryReward, type DeliveryRewardInput } from '../../src/systems/delivery-reward';

// The values below are chosen so each wrong composition order produces a
// DIFFERENT number than the pinned expectation, so a reshuffle cannot pass:
// reputation 3 is the 1.1 'favoured rates' step, a reconnected destination is
// the 1.2 premium, and negotiator rank 1 is +10 percent.

function input(overrides: Partial<DeliveryRewardInput> = {}): DeliveryRewardInput {
  return {
    contractId: 'no-bonus-contract',
    contractReward: 45,
    cargoType: undefined,
    destinationStatus: 'silent',
    totalReputation: 0,
    skills: {},
    bonusFacts: { usedFord: false, tilesDriven: 0 },
    ...overrides,
  };
}

describe('computeDeliveryReward', () => {
  it('pays exactly the contract reward with no modifiers in play', () => {
    const reward = computeDeliveryReward(input());
    expect(reward.baseReward).toBe(45);
    expect(reward.payout).toBe(45);
    expect(reward.skillReward).toBe(0);
    expect(reward.cipherReward).toBe(0);
    expect(reward.bonusCoins).toBe(0);
    expect(reward.total).toBe(45);
    expect(reward.reconnectPremium).toBe(false);
  });

  it('composes reconnect premium, standing bonus, skill cut, and bonus coins in order', () => {
    // 45 goods -> 45; x1.2 reconnect = 54; x1.1 standing = 59.4 -> 59;
    // negotiator 10% of 59 = 5.9 -> 6; via-ford bonus +30. Total 95.
    // Wrong orders diverge: standing before reconnect gives 50 x1.2 = 60,
    // and a skill cut off the base (54) gives 5, so neither can pass.
    const reward = computeDeliveryReward(
      input({
        contractId: 'secret-to-mirewatch',
        destinationStatus: 'reconnected',
        totalReputation: 3,
        skills: { negotiator: 1 },
        bonusFacts: { usedFord: true, tilesDriven: 99 },
      }),
    );
    expect(reward.baseReward).toBe(54);
    expect(reward.payout).toBe(59);
    expect(reward.skillReward).toBe(6);
    expect(reward.bonusCoins).toBe(30);
    expect(reward.total).toBe(95);
    expect(reward.reconnectPremium).toBe(true);
  });

  it('rounds the reconnect-adjusted base before applying the standing bonus', () => {
    // 37 x1.2 = 44.4 -> 44; 44 x1.1 = 48.4 -> 48. Unrounded chaining would
    // give 37 x1.2 x1.1 = 48.84 -> 49, so this pins the intermediate round.
    const reward = computeDeliveryReward(
      input({ contractReward: 37, destinationStatus: 'reconnected', totalReputation: 3 }),
    );
    expect(reward.baseReward).toBe(44);
    expect(reward.payout).toBe(48);
    expect(reward.total).toBe(48);
  });

  it('applies the cargo pay modifier before everything else', () => {
    // 45 secrets x1.2 = 54, no other modifiers.
    const reward = computeDeliveryReward(input({ cargoType: 'secrets' }));
    expect(reward.baseReward).toBe(54);
    expect(reward.total).toBe(54);
  });

  it('adds the Cipher rider on a secrets delivery, off the boosted payout (#323)', () => {
    // 45 secrets x1.2 = 54 payout; cipher +15% of 54 = 8.1 -> 8. Total 62.
    const withCipher = computeDeliveryReward(input({ cargoType: 'secrets', skills: { cipher: 1 } }));
    expect(withCipher.payout).toBe(54);
    expect(withCipher.cipherReward).toBe(8);
    expect(withCipher.total).toBe(62);
  });

  it('pays no Cipher rider on non-secrets cargo, nor on secrets without Cipher', () => {
    const goodsCipher = computeDeliveryReward(input({ cargoType: 'goods', skills: { cipher: 1 } }));
    expect(goodsCipher.cipherReward).toBe(0);
    expect(goodsCipher.total).toBe(45);

    const secretsNoCipher = computeDeliveryReward(input({ cargoType: 'secrets' }));
    expect(secretsNoCipher.cipherReward).toBe(0);
    expect(secretsNoCipher.total).toBe(54);
  });

  it('withholds the bonus when its objective was missed', () => {
    // via-ford bonus exists for this contract, but the ford was not used.
    const reward = computeDeliveryReward(
      input({
        contractId: 'secret-to-mirewatch',
        bonusFacts: { usedFord: false, tilesDriven: 5 },
      }),
    );
    expect(reward.bonusCoins).toBe(0);
    expect(reward.total).toBe(45);
  });

  it('pays no premium on the delivery that itself reconnects a silent place', () => {
    const reward = computeDeliveryReward(input({ destinationStatus: 'silent' }));
    expect(reward.reconnectPremium).toBe(false);
    expect(reward.total).toBe(45);
  });
});
