import { describe, it, expect } from 'vitest';
import {
  hiddenRoadProgress,
  hiddenRoadJournalLines,
  type ThreadRegion,
} from '../../src/systems/story-threads';
import { emptyFlags, flagsFromArray } from '../../src/systems/dialogue';
import type { Contract } from '../../src/systems/contract-system';

function contract(id: string, overrides: Partial<Contract> = {}): Contract {
  return {
    id,
    title: id,
    cargo: 'letter',
    pickupId: 'home',
    destinationId: 'there',
    reward: 50,
    reputation: 2,
    minReputation: 0,
    note: '',
    ...overrides,
  };
}

// One standing contract and one arc-gated contract per region.
const REGIONS: ThreadRegion[] = [
  {
    name: 'Alpha',
    contracts: [contract('a-standing'), contract('a-arc', { title: 'Letters A', requires: { allOf: ['reveal_a'] }, arc: true })],
  },
  {
    name: 'Beta',
    contracts: [contract('b-standing'), contract('b-arc', { title: 'Letters B', requires: { allOf: ['reveal_b'] }, arc: true })],
  },
];

describe('hiddenRoadProgress', () => {
  it('counts only arc contracts, ignoring standing routes', () => {
    const p = hiddenRoadProgress(REGIONS, new Set(), emptyFlags());
    expect(p.total).toBe(2);
    expect(p.entries.map((e) => e.contractTitle)).toEqual(['Letters A', 'Letters B']);
  });

  it('ignores gated work that is not arc work (second-wave reconnection routes)', () => {
    const withSecondWave: ThreadRegion[] = [
      {
        name: 'Alpha',
        contracts: [
          contract('a-arc', { title: 'Letters A', requires: { allOf: ['reveal_a'] }, arc: true }),
          // Gated, but not arc: must stay out of the Hidden Road count.
          contract('a-relay', { title: 'Relay A', requires: { allOf: ['reconnected_x'] } }),
        ],
      },
    ];
    const p = hiddenRoadProgress(withSecondWave, new Set(), flagsFromArray(['reveal_a', 'reconnected_x']));
    expect(p.total).toBe(1);
    expect(p.entries.map((e) => e.contractTitle)).toEqual(['Letters A']);
  });

  it('is not started until an arc contract is revealed or delivered', () => {
    expect(hiddenRoadProgress(REGIONS, new Set(), emptyFlags()).started).toBe(false);
  });

  it('starts once an arc contract is revealed by its flag', () => {
    const p = hiddenRoadProgress(REGIONS, new Set(), flagsFromArray(['reveal_a']));
    expect(p.started).toBe(true);
    expect(p.done).toBe(0);
  });

  it('starts (and counts) once an arc contract is delivered, even without the flag', () => {
    const p = hiddenRoadProgress(REGIONS, new Set(['a-arc']), emptyFlags());
    expect(p.started).toBe(true);
    expect(p.done).toBe(1);
    expect(p.entries.find((e) => e.contractTitle === 'Letters A')?.done).toBe(true);
  });

  it('reports total across all regions regardless of how many are revealed', () => {
    const p = hiddenRoadProgress(REGIONS, new Set(['a-arc']), flagsFromArray(['reveal_a']));
    expect(p.total).toBe(2);
    expect(p.done).toBe(1);
  });
});

describe('hiddenRoadJournalLines', () => {
  it('is empty before the thread starts (no spoiler)', () => {
    expect(hiddenRoadJournalLines(hiddenRoadProgress(REGIONS, new Set(), emptyFlags()))).toEqual([]);
  });

  it('renders a header, count, and checklist once started', () => {
    const lines = hiddenRoadJournalLines(
      hiddenRoadProgress(REGIONS, new Set(['a-arc']), flagsFromArray(['reveal_a'])),
    );
    expect(lines[0]).toBe('The Hidden Road:');
    expect(lines.some((l) => l.includes('1/2'))).toBe(true);
    expect(lines.some((l) => l.includes('[x] Letters A (Alpha)'))).toBe(true);
    expect(lines.some((l) => l.includes('[ ] Letters B (Beta)'))).toBe(true);
  });

  it('renders nothing when there are no arc contracts at all', () => {
    const plain: ThreadRegion[] = [{ name: 'Solo', contracts: [contract('only-standing')] }];
    expect(hiddenRoadJournalLines(hiddenRoadProgress(plain, new Set(), emptyFlags()))).toEqual([]);
  });
});
