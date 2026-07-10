import { describe, it, expect } from 'vitest';
import { buildJournalText, type JournalTextInput } from '../../src/systems/journal-text';
import type { JournalInput } from '../../src/systems/journal';
import type { Mission } from '../../src/systems/mission-system';
import type { ThreadRegion } from '../../src/systems/story-threads';
import type { Contract } from '../../src/systems/contract-system';
import { emptyFlags, flagsFromArray } from '../../src/systems/dialogue';

const SETTLEMENTS: JournalInput['settlements'] = [
  { id: 'greybridge', name: 'Greybridge', note: 'A bridge town.', status: 'home', reconnectedNote: 'Home.' },
  { id: 'ashford', name: 'Ashford', note: 'Burned twice.', status: 'reconnected', reconnectedNote: 'Ashford answers again.' },
  { id: 'mirewatch', name: 'Mirewatch', note: 'A watchtower.', status: 'silent', reconnectedNote: 'Lamp lit.' },
];

const MISSION: Mission = {
  id: 'blockade',
  title: 'The Blockade',
  regionId: 'greybridge',
  steps: [
    { id: 's1', summary: 'Reach Ashford', requires: { visited: ['ashford'] } },
    { id: 's2', summary: 'Deliver the letters', requires: { contractsCompleted: ['c1'] } },
  ],
};

function contract(id: string, overrides: Partial<Contract> = {}): Contract {
  return {
    id,
    title: id,
    cargo: 'letter',
    pickupId: 'greybridge',
    destinationId: 'ashford',
    reward: 50,
    reputation: 2,
    minReputation: 0,
    note: '',
    ...overrides,
  };
}

const THREAD_REGIONS: ThreadRegion[] = [
  {
    name: 'Greybridge',
    contracts: [contract('standing'), contract('arc', { title: 'Unsigned Letters', requires: { allOf: ['reveal'] }, arc: true })],
  },
];

function makeInput(overrides: Partial<JournalTextInput> = {}): JournalTextInput {
  return {
    journal: {
      settlements: SETTLEMENTS,
      visitedIds: ['greybridge', 'ashford'],
      delivered: 1,
      totalContracts: 3,
      reputationTier: 'Neutral',
      fordUnlocked: false,
      activeObjective: null,
    },
    title: 'Courier',
    distanceText: '12 tiles',
    mission: { missions: [MISSION], state: { completedContractIds: [], flags: new Set(), visitedIds: ['ashford'] }, regionId: 'greybridge' },
    threads: { regions: THREAD_REGIONS, completedIds: new Set(), flags: emptyFlags() },
    recentEvents: [],
    achievements: [{ name: 'First Delivery', earned: true }, { name: 'Explorer', earned: false }],
    ...overrides,
  };
}

describe('buildJournalText', () => {
  it('renders the header, title, and distance', () => {
    const text = buildJournalText(makeInput());
    expect(text).toContain('DISCOVERIES JOURNAL');
    expect(text).toContain('Title: Courier');
    expect(text).toContain('Distance driven: 12 tiles');
  });

  it('passes through buildJournal place masking and reconnection notes', () => {
    const text = buildJournalText(makeInput({
      journal: { ...makeInput().journal, visitedIds: ['greybridge', 'ashford'] },
    }));
    // Ashford is discovered and reconnected: real name, tag, and payoff line.
    expect(text).toContain('Ashford [Reconnected] - Burned twice.');
    expect(text).toContain('Ashford answers again.');
    // Mirewatch is undiscovered: masked, no real name or note leaks.
    expect(text).toContain('??? - Undiscovered.');
    expect(text).not.toContain('A watchtower.');
  });

  it('shows the active mission and marks step progress', () => {
    const text = buildJournalText(makeInput());
    expect(text).toContain('The Blockade');
    expect(text).toContain('[x] Reach Ashford'); // visited
    expect(text).toContain('[>] Deliver the letters'); // current
  });

  it('shows a resting message when every mission is complete', () => {
    const text = buildJournalText(makeInput({
      // Both steps satisfied, so the mission is complete and none remain active.
      mission: { missions: [MISSION], state: { completedContractIds: ['c1'], flags: new Set(), visitedIds: ['ashford'] }, regionId: 'greybridge' },
    }));
    expect(text).toContain('No mission calls just now');
  });

  it('hides the Hidden Road thread until it has started', () => {
    const text = buildJournalText(makeInput());
    expect(text).not.toContain('The Hidden Road');
  });

  it('shows the Hidden Road thread once an arc contract is revealed', () => {
    const text = buildJournalText(makeInput({
      threads: { regions: THREAD_REGIONS, completedIds: new Set(), flags: flagsFromArray(['reveal']) },
    }));
    expect(text).toContain('The Hidden Road');
    expect(text).toContain('Unsigned Letters');
  });

  it('lists recent events newest first, and omits the section when empty', () => {
    expect(buildJournalText(makeInput())).not.toContain('Recent:');
    const text = buildJournalText(makeInput({ recentEvents: ['first', 'second'] }));
    const firstIdx = text.indexOf('first');
    const secondIdx = text.indexOf('second');
    expect(text).toContain('Recent:');
    expect(secondIdx).toBeLessThan(firstIdx); // newest (last pushed) appears first
  });

  it('renders the achievement checklist with earned marks', () => {
    const text = buildJournalText(makeInput());
    expect(text).toContain('[x] First Delivery');
    expect(text).toContain('[ ] Explorer');
  });
});
