import { describe, it, expect } from 'vitest';
import { computeRunSummary } from '../../src/systems/run-summary';
import type { RunSummaryInput } from '../../src/systems/run-summary';

// Reusable base input for tests that only need to vary one field.
const base: RunSummaryInput = {
  regionName: 'Greybridge Region',
  coins: 120,
  totalReputation: 10,
  reputationTier: 'Trusted',
  delivered: 2,
  totalContracts: 3,
  fordUnlocked: false,
  upgradesOwned: 1,
};

describe('computeRunSummary - complete flag', () => {
  it('is false when delivered < totalContracts', () => {
    const result = computeRunSummary({ ...base, delivered: 2, totalContracts: 3 });
    expect(result.complete).toBe(false);
  });

  it('is true when delivered equals totalContracts', () => {
    const result = computeRunSummary({ ...base, delivered: 3, totalContracts: 3 });
    expect(result.complete).toBe(true);
  });

  it('is false when totalContracts is 0, regardless of delivered', () => {
    const result = computeRunSummary({ ...base, delivered: 0, totalContracts: 0 });
    expect(result.complete).toBe(false);
  });

  it('is false when delivered is 0 and totalContracts is positive', () => {
    const result = computeRunSummary({ ...base, delivered: 0, totalContracts: 3 });
    expect(result.complete).toBe(false);
  });
});

describe('computeRunSummary - title', () => {
  it('returns "Courier Ledger" when not complete', () => {
    const result = computeRunSummary({ ...base, delivered: 1, totalContracts: 3 });
    expect(result.title).toBe('Courier Ledger');
  });

  it('returns "<region> Cleared" when complete', () => {
    const result = computeRunSummary({ ...base, delivered: 3, totalContracts: 3 });
    expect(result.title).toBe('Greybridge Region Cleared');
  });

  it('derives the cleared title from the region name', () => {
    const result = computeRunSummary({
      ...base,
      regionName: 'Saltreach',
      delivered: 3,
      totalContracts: 3,
    });
    expect(result.title).toBe('Saltreach Cleared');
  });
});

describe('computeRunSummary - lines content', () => {
  it('includes delivered and totalContracts in the contracts line', () => {
    const result = computeRunSummary({ ...base, delivered: 2, totalContracts: 3 });
    expect(result.lines).toContain('Contracts delivered: 2 / 3');
  });

  it('includes the coin count', () => {
    const result = computeRunSummary({ ...base, coins: 75 });
    expect(result.lines).toContain('Coins: 75');
  });

  it('includes reputation value and tier', () => {
    const result = computeRunSummary({
      ...base,
      totalReputation: 15,
      reputationTier: 'Honoured',
    });
    expect(result.lines).toContain('Reputation: 15 (Honoured)');
  });

  it('includes upgrades count', () => {
    const result = computeRunSummary({ ...base, upgradesOwned: 2 });
    expect(result.lines).toContain('Upgrades fitted: 2');
  });
});

describe('computeRunSummary - ford shortcut wording', () => {
  it('shows "opened" when fordUnlocked is true', () => {
    const result = computeRunSummary({ ...base, fordUnlocked: true });
    expect(result.lines).toContain('Ford shortcut: opened');
  });

  it('shows "not opened" when fordUnlocked is false', () => {
    const result = computeRunSummary({ ...base, fordUnlocked: false });
    expect(result.lines).toContain('Ford shortcut: not opened');
  });
});

describe('computeRunSummary - flavour line', () => {
  it('adds a region-named flavour line when complete', () => {
    const result = computeRunSummary({ ...base, delivered: 3, totalContracts: 3 });
    expect(result.lines).toContain('The roads of Greybridge Region know your wheels now.');
  });

  it('names the flavour line after the cleared region', () => {
    const result = computeRunSummary({
      ...base,
      regionName: 'Fenmarch',
      delivered: 3,
      totalContracts: 3,
    });
    expect(result.lines).toContain('The roads of Fenmarch know your wheels now.');
  });

  it('does not add the flavour line when incomplete', () => {
    const result = computeRunSummary({ ...base, delivered: 1, totalContracts: 3 });
    const hasFlavour = result.lines.some((line) => line.includes('know your wheels'));
    expect(hasFlavour).toBe(false);
  });
});
