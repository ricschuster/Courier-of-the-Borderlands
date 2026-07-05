import { describe, it, expect } from 'vitest';
import {
  createLedger,
  addCoins,
  addReputation,
  reputationWith,
  totalReputation,
  tierFor,
} from '../../src/systems/economy';

describe('createLedger', () => {
  it('defaults to 0 coins and empty reputation', () => {
    const ledger = createLedger();
    expect(ledger.coins).toBe(0);
    expect(ledger.reputation).toEqual({});
  });

  it('accepts a custom starting coin value', () => {
    const ledger = createLedger(50);
    expect(ledger.coins).toBe(50);
  });

  it('clamps negative starting coins to 0', () => {
    const ledger = createLedger(-10);
    expect(ledger.coins).toBe(0);
  });
});

describe('addCoins', () => {
  it('adds coins to the ledger', () => {
    const ledger = addCoins(createLedger(10), 5);
    expect(ledger.coins).toBe(15);
  });

  it('accumulates across multiple additions', () => {
    let ledger = createLedger();
    ledger = addCoins(ledger, 10);
    ledger = addCoins(ledger, 20);
    expect(ledger.coins).toBe(30);
  });

  it('clamps to 0 when spending past zero', () => {
    const ledger = addCoins(createLedger(5), -100);
    expect(ledger.coins).toBe(0);
  });

  it('subtracts coins correctly when funds are sufficient', () => {
    const ledger = addCoins(createLedger(20), -8);
    expect(ledger.coins).toBe(12);
  });

  it('does not mutate the original ledger', () => {
    const original = createLedger(10);
    addCoins(original, 5);
    expect(original.coins).toBe(10);
  });
});

describe('addReputation', () => {
  it('sets reputation for a new settlement', () => {
    const ledger = addReputation(createLedger(), 'greybridge', 3);
    expect(reputationWith(ledger, 'greybridge')).toBe(3);
  });

  it('accumulates reputation across multiple additions', () => {
    let ledger = createLedger();
    ledger = addReputation(ledger, 'greybridge', 3);
    ledger = addReputation(ledger, 'greybridge', 5);
    expect(reputationWith(ledger, 'greybridge')).toBe(8);
  });

  it('tracks settlements independently', () => {
    let ledger = createLedger();
    ledger = addReputation(ledger, 'greybridge', 5);
    ledger = addReputation(ledger, 'thornhaven', 2);
    expect(reputationWith(ledger, 'greybridge')).toBe(5);
    expect(reputationWith(ledger, 'thornhaven')).toBe(2);
  });

  it('clamps per-settlement reputation to 0 when subtracting past zero', () => {
    const ledger = addReputation(createLedger(), 'greybridge', -10);
    expect(reputationWith(ledger, 'greybridge')).toBe(0);
  });

  it('clamps correctly when existing value is insufficient to cover subtraction', () => {
    let ledger = createLedger();
    ledger = addReputation(ledger, 'greybridge', 3);
    ledger = addReputation(ledger, 'greybridge', -100);
    expect(reputationWith(ledger, 'greybridge')).toBe(0);
  });

  it('does not mutate the original ledger', () => {
    const original = createLedger();
    addReputation(original, 'greybridge', 5);
    expect(reputationWith(original, 'greybridge')).toBe(0);
  });
});

describe('reputationWith', () => {
  it('returns 0 for an unknown settlement', () => {
    expect(reputationWith(createLedger(), 'unknown-town')).toBe(0);
  });
});

describe('totalReputation', () => {
  it('returns 0 for an empty ledger', () => {
    expect(totalReputation(createLedger())).toBe(0);
  });

  it('sums reputation across multiple settlements', () => {
    let ledger = createLedger();
    ledger = addReputation(ledger, 'greybridge', 5);
    ledger = addReputation(ledger, 'thornhaven', 3);
    ledger = addReputation(ledger, 'eastfold', 7);
    expect(totalReputation(ledger)).toBe(15);
  });

  it('returns a single settlement value when only one exists', () => {
    const ledger = addReputation(createLedger(), 'greybridge', 8);
    expect(totalReputation(ledger)).toBe(8);
  });
});

describe('tierFor', () => {
  it('returns Stranger at 0', () => {
    expect(tierFor(0).name).toBe('Stranger');
  });

  it('returns Known at exactly 3', () => {
    expect(tierFor(3).name).toBe('Known');
  });

  it('returns Trusted at exactly 8', () => {
    expect(tierFor(8).name).toBe('Trusted');
  });

  it('returns Honoured at exactly 15', () => {
    expect(tierFor(15).name).toBe('Honoured');
  });

  it('returns Stranger for values between 0 and 2 (below Known threshold)', () => {
    expect(tierFor(2).name).toBe('Stranger');
  });

  it('returns Known for values between 3 and 7', () => {
    expect(tierFor(5).name).toBe('Known');
  });

  it('returns Trusted for values between 8 and 14', () => {
    expect(tierFor(12).name).toBe('Trusted');
  });

  it('returns Honoured for values above 15', () => {
    expect(tierFor(20).name).toBe('Honoured');
  });
});
