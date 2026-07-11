import { describe, it, expect } from 'vitest';
import { traversalKeys, type CapabilityGrants } from '../../src/systems/traversal';

// A small synthetic grant map so the tests do not depend on the canonical
// content: "mire" needs the treads upgrade or off-road rank 2; "scree" needs a
// climb skill at rank 1.
const GRANTS: CapabilityGrants = {
  mire: { upgrades: ['treads'], skills: [{ id: 'off-road', minRank: 2 }] },
  scree: { skills: [{ id: 'climb', minRank: 1 }] },
};

const S = (...ids: string[]) => new Set(ids);

describe('traversalKeys', () => {
  it('always passes unlocks through as their own tokens', () => {
    const keys = traversalKeys(S('ford-a', 'ford-b'), S(), {}, GRANTS);
    expect(keys.has('ford-a')).toBe(true);
    expect(keys.has('ford-b')).toBe(true);
  });

  it('grants a capability from an owned upgrade', () => {
    const keys = traversalKeys(S(), S('treads'), {}, GRANTS);
    expect(keys.has('mire')).toBe(true);
  });

  it('grants a capability from a skill at or above the required rank', () => {
    expect(traversalKeys(S(), S(), { 'off-road': 2 }, GRANTS).has('mire')).toBe(true);
    expect(traversalKeys(S(), S(), { 'off-road': 3 }, GRANTS).has('mire')).toBe(true);
  });

  it('does not grant a capability from a skill below the required rank', () => {
    expect(traversalKeys(S(), S(), { 'off-road': 1 }, GRANTS).has('mire')).toBe(false);
  });

  it('grants nothing extra when no source is satisfied', () => {
    const keys = traversalKeys(S(), S('unrelated'), { other: 5 }, GRANTS);
    expect(keys.has('mire')).toBe(false);
    expect(keys.has('scree')).toBe(false);
  });

  it('either source satisfies the same capability (upgrade OR skill)', () => {
    expect(traversalKeys(S(), S('treads'), {}, GRANTS).has('mire')).toBe(true);
    expect(traversalKeys(S(), S(), { 'off-road': 2 }, GRANTS).has('mire')).toBe(true);
  });

  it('keeps unlocks and granted capabilities together in one set', () => {
    const keys = traversalKeys(S('ford-a'), S('treads'), { climb: 1 }, GRANTS);
    expect([...keys].sort()).toEqual(['ford-a', 'mire', 'scree'].sort());
  });

  it('uses the canonical grant map by default (marsh-treads opens mire-crossing)', () => {
    expect(traversalKeys(S(), S('marsh-treads'), {}).has('mire-crossing')).toBe(true);
    expect(traversalKeys(S(), S(), {}).has('mire-crossing')).toBe(false);
  });

  it('opens mire-crossing with Off-road rank 2 (skill points as the alternative key)', () => {
    expect(traversalKeys(S(), S(), { 'off-road': 2 }).has('mire-crossing')).toBe(true);
    expect(traversalKeys(S(), S(), { 'off-road': 3 }).has('mire-crossing')).toBe(true);
    // Rank 1 is not enough: the coins-vs-points choice costs two points.
    expect(traversalKeys(S(), S(), { 'off-road': 1 }).has('mire-crossing')).toBe(false);
  });
});
