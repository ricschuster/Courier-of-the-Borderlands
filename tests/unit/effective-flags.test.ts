import { describe, it, expect } from 'vitest';
import {
  baseContractCounts,
  effectiveFlags,
  isRegionCleared,
} from '../../src/systems/effective-flags';
import { emptyFlags, flagsFromArray, hasFlag } from '../../src/systems/dialogue';
import { reconnectedFlag } from '../../src/systems/world-state';
import { skillFlag } from '../../src/systems/skills';
import { getRegion } from '../../src/systems/region-system';
import { baseContracts } from '../../src/systems/contract-system';
import { FLAG_HOME_RECONNECTED } from '../../src/data/dialogue-content';

// The derivation the #392 survey called a dependency cycle
// (boardContracts -> effectiveFlags -> regionCleared -> baseContractCounts ->
// completed) and treated as the reason the contract cluster could not be taken.
//
// The cycle only exists if something tries to *own* the state. As pure functions
// taking their inputs as arguments there is no cycle, just a derivation, which is
// what made this testable at all.
//
// Asserts against real region data rather than invented contract ids (trap 7).

const REGION = getRegion('greybridge');
const BASE = baseContracts(REGION.contracts);

describe('isRegionCleared', () => {
  it('is false with nothing delivered', () => {
    expect(isRegionCleared(REGION.contracts, new Set())).toBe(false);
  });

  it('is false with all but one standing route delivered', () => {
    const allButOne = new Set(BASE.slice(0, -1).map((c) => c.id));
    expect(isRegionCleared(REGION.contracts, allButOne)).toBe(false);
  });

  it('is true once every standing route is delivered', () => {
    expect(isRegionCleared(REGION.contracts, new Set(BASE.map((c) => c.id)))).toBe(true);
  });

  // The rule the comment in the scene explained and nothing checked. Gated
  // contracts are unlocked *by* the arc's reveals, so counting them would
  // re-lock a reveal the moment it opened new work.
  it('ignores gated contracts, so opening new work cannot un-clear a region', () => {
    const gated = REGION.contracts.filter((c) => c.requires !== undefined);
    expect(gated.length, 'greybridge should have gated contracts to test with').toBeGreaterThan(0);

    const standingOnly = new Set(BASE.map((c) => c.id));
    expect(isRegionCleared(REGION.contracts, standingOnly)).toBe(true);
  });

  it('is never true for a region with no standing routes', () => {
    expect(isRegionCleared([], new Set())).toBe(false);
  });
});

describe('baseContractCounts', () => {
  it('counts delivered against the standing routes only', () => {
    const first = BASE[0];
    if (first === undefined) {
      throw new Error('greybridge has no standing routes');
    }

    expect(baseContractCounts(REGION.contracts, new Set([first.id]))).toEqual({
      delivered: 1,
      total: BASE.length,
    });
  });

  it('does not count a delivered gated contract toward the total', () => {
    const gated = REGION.contracts.find((c) => c.requires !== undefined);
    if (gated === undefined) {
      throw new Error('greybridge has no gated contracts');
    }

    expect(baseContractCounts(REGION.contracts, new Set([gated.id]))).toEqual({
      delivered: 0,
      total: BASE.length,
    });
  });
});

describe('effectiveFlags', () => {
  const base = {
    storyFlags: emptyFlags(),
    skills: {},
    regionCleared: false,
    worldState: {},
  };

  it('passes saved flags through untouched', () => {
    const saved = flagsFromArray(['some_saved_flag']);
    expect(hasFlag(effectiveFlags({ ...base, storyFlags: saved }), 'some_saved_flag')).toBe(true);
  });

  it('emits a flag for each owned skill, so dialogue can gate on them', () => {
    const flags = effectiveFlags({ ...base, skills: { cipher: 1, wayfinder: 2 } });

    expect(hasFlag(flags, skillFlag('cipher'))).toBe(true);
    expect(hasFlag(flags, skillFlag('wayfinder'))).toBe(true);
    expect(hasFlag(flags, skillFlag('negotiator'))).toBe(false);
  });

  it('emits the home-reconnected flag only once the region is cleared', () => {
    expect(hasFlag(effectiveFlags(base), FLAG_HOME_RECONNECTED)).toBe(false);
    expect(
      hasFlag(effectiveFlags({ ...base, regionCleared: true }), FLAG_HOME_RECONNECTED),
    ).toBe(true);
  });

  it('emits a flag per reconnected settlement, and only for reconnected ones', () => {
    const flags = effectiveFlags({
      ...base,
      worldState: { eastwatch: 'reconnected', southmill: 'silent', greywater: 'home' },
    });

    expect(hasFlag(flags, reconnectedFlag('eastwatch'))).toBe(true);
    expect(hasFlag(flags, reconnectedFlag('southmill'))).toBe(false);
    expect(hasFlag(flags, reconnectedFlag('greywater'))).toBe(false);
  });

  it('combines saved and derived flags rather than replacing either', () => {
    const flags = effectiveFlags({
      storyFlags: flagsFromArray(['saved_one']),
      skills: { cipher: 1 },
      regionCleared: true,
      worldState: { eastwatch: 'reconnected' },
    });

    expect(hasFlag(flags, 'saved_one')).toBe(true);
    expect(hasFlag(flags, skillFlag('cipher'))).toBe(true);
    expect(hasFlag(flags, FLAG_HOME_RECONNECTED)).toBe(true);
    expect(hasFlag(flags, reconnectedFlag('eastwatch'))).toBe(true);
  });

  it('does not mutate the flags it was given, since derived flags are never saved', () => {
    const saved = flagsFromArray(['saved_one']);
    effectiveFlags({ ...base, storyFlags: saved, regionCleared: true });

    expect(hasFlag(saved, FLAG_HOME_RECONNECTED)).toBe(false);
  });
});
