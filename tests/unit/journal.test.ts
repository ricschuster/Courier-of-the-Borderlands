import { describe, it, expect } from 'vitest';
import { buildJournal } from '../../src/systems/journal';
import type { JournalInput } from '../../src/systems/journal';

const SETTLEMENTS = [
  { id: 'greybridge', name: 'Greybridge', note: 'A crumbling stone bridge town, fog-bound in winter.' },
  { id: 'ashford',    name: 'Ashford',    note: 'Burned twice. Rebuilt twice. The locals do not talk about why.' },
  { id: 'mirewatch',  name: 'Mirewatch',  note: 'A watchtower half-swallowed by the marsh.' },
] as const;

function makeInput(overrides: Partial<JournalInput> = {}): JournalInput {
  return {
    settlements: SETTLEMENTS,
    visitedIds: ['greybridge'],
    delivered: 1,
    totalContracts: 3,
    reputationTier: 'Neutral',
    fordUnlocked: false,
    ...overrides,
  };
}

describe('buildJournal', () => {
  it('shows real name and note for a discovered place', () => {
    const { places } = buildJournal(makeInput({ visitedIds: ['greybridge'] }));
    const place = places[0];
    expect(place?.discovered).toBe(true);
    expect(place?.name).toBe('Greybridge');
    expect(place?.note).toBe('A crumbling stone bridge town, fog-bound in winter.');
  });

  it('masks name and note for an undiscovered place', () => {
    const { places } = buildJournal(makeInput({ visitedIds: ['greybridge'] }));
    const place = places[1]; // ashford not visited
    expect(place?.discovered).toBe(false);
    expect(place?.name).toBe('???');
    expect(place?.note).toBe('Undiscovered.');
  });

  it('does not expose the real name or note for an undiscovered place', () => {
    const { places } = buildJournal(makeInput({ visitedIds: [] }));
    for (const place of places) {
      expect(place.name).not.toBe('Greybridge');
      expect(place.name).not.toBe('Ashford');
      expect(place.name).not.toBe('Mirewatch');
      expect(place.note).not.toContain('crumbling');
      expect(place.note).not.toContain('Burned');
      expect(place.note).not.toContain('watchtower');
    }
  });

  it('preserves input order for places', () => {
    const { places } = buildJournal(makeInput({ visitedIds: ['mirewatch', 'ashford'] }));
    // Order must follow SETTLEMENTS array: greybridge, ashford, mirewatch
    expect(places[0]?.discovered).toBe(false); // greybridge not visited
    expect(places[1]?.discovered).toBe(true);  // ashford visited
    expect(places[2]?.discovered).toBe(true);  // mirewatch visited
  });

  it('reports the correct discovered count in summaryLines', () => {
    const { summaryLines } = buildJournal(makeInput({ visitedIds: ['greybridge', 'mirewatch'] }));
    expect(summaryLines[0]).toBe('Places found: 2 / 3');
  });

  it('reports zero discovered places when none visited', () => {
    const { summaryLines } = buildJournal(makeInput({ visitedIds: [] }));
    expect(summaryLines[0]).toBe('Places found: 0 / 3');
  });

  it('reports "sealed" when ford is locked', () => {
    const { summaryLines } = buildJournal(makeInput({ fordUnlocked: false }));
    expect(summaryLines[3]).toBe('Ford shortcut: sealed');
  });

  it('reports "open" when ford is unlocked', () => {
    const { summaryLines } = buildJournal(makeInput({ fordUnlocked: true }));
    expect(summaryLines[3]).toBe('Ford shortcut: open');
  });

  it('includes delivered and reputation tier in summaryLines', () => {
    const { summaryLines } = buildJournal(makeInput({ delivered: 2, totalContracts: 5, reputationTier: 'Trusted' }));
    expect(summaryLines[1]).toBe('Contracts delivered: 2 / 5');
    expect(summaryLines[2]).toBe('Standing: Trusted');
  });
});
