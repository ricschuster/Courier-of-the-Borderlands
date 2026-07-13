import { describe, it, expect } from 'vitest';
import {
  pickEncounter,
  activeEncounters,
  isEncounterResolved,
  resolutionFlags,
  outcomeForFlag,
  validateEncounter,
  type RoadEncounter,
} from '../../src/systems/encounter-system';
import { END_DIALOGUE, flagsFromArray, emptyFlags, type Dialogue } from '../../src/systems/dialogue';

// A minimal well-formed encounter: two endings, each setting a resolution flag.
function makeEncounter(overrides: Partial<RoadEncounter> = {}): RoadEncounter {
  const dialogue: Dialogue = {
    start: 'scene',
    nodes: {
      scene: {
        id: 'scene',
        speaker: 'Someone',
        text: 'A choice.',
        choices: [
          { label: 'Pay', set: ['enc_paid'], next: END_DIALOGUE },
          { label: 'Refuse', set: ['enc_refused'], next: END_DIALOGUE },
        ],
      },
    },
  };
  return {
    id: 'test-encounter',
    title: 'Test',
    regionId: 'greybridge',
    tile: { x: 7, y: 8 },
    dialogue,
    outcomes: {
      enc_paid: { coins: -10 },
      enc_refused: {},
    },
    ...overrides,
  };
}

describe('resolutionFlags', () => {
  it('returns the keys of the outcomes map', () => {
    expect(resolutionFlags(makeEncounter()).slice().sort()).toEqual(['enc_paid', 'enc_refused']);
  });
});

describe('isEncounterResolved', () => {
  it('is false when no resolution flag is set', () => {
    expect(isEncounterResolved(makeEncounter(), emptyFlags())).toBe(false);
  });

  it('is true once any resolution flag is set', () => {
    expect(isEncounterResolved(makeEncounter(), flagsFromArray(['enc_refused']))).toBe(true);
  });

  it('ignores unrelated flags', () => {
    expect(isEncounterResolved(makeEncounter(), flagsFromArray(['something_else']))).toBe(false);
  });
});

describe('outcomeForFlag', () => {
  it('returns the outcome for a resolution flag', () => {
    expect(outcomeForFlag(makeEncounter(), 'enc_paid')).toEqual({ coins: -10 });
  });

  it('returns undefined for a non-outcome flag', () => {
    expect(outcomeForFlag(makeEncounter(), 'nope')).toBeUndefined();
  });
});

describe('pickEncounter', () => {
  const encounters = [makeEncounter()];

  it('returns the encounter on its tile in its region when unresolved', () => {
    const picked = pickEncounter(encounters, {
      regionId: 'greybridge',
      tile: { x: 7, y: 8 },
      flags: emptyFlags(),
    });
    expect(picked?.id).toBe('test-encounter');
  });

  it('returns undefined on a different tile', () => {
    expect(
      pickEncounter(encounters, { regionId: 'greybridge', tile: { x: 8, y: 8 }, flags: emptyFlags() }),
    ).toBeUndefined();
  });

  it('returns undefined in a different region', () => {
    expect(
      pickEncounter(encounters, { regionId: 'saltreach', tile: { x: 7, y: 8 }, flags: emptyFlags() }),
    ).toBeUndefined();
  });

  it('returns undefined once the encounter is resolved (one-shot)', () => {
    expect(
      pickEncounter(encounters, {
        regionId: 'greybridge',
        tile: { x: 7, y: 8 },
        flags: flagsFromArray(['enc_paid']),
      }),
    ).toBeUndefined();
  });

  it('respects a requires gate', () => {
    const gated = [makeEncounter({ requires: { allOf: ['arc_started'] } })];
    const query = { regionId: 'greybridge', tile: { x: 7, y: 8 } };
    expect(pickEncounter(gated, { ...query, flags: emptyFlags() })).toBeUndefined();
    expect(pickEncounter(gated, { ...query, flags: flagsFromArray(['arc_started']) })?.id).toBe(
      'test-encounter',
    );
  });

  it('returns the first match in list order', () => {
    const a = makeEncounter({ id: 'a' });
    const b = makeEncounter({ id: 'b' });
    expect(
      pickEncounter([a, b], { regionId: 'greybridge', tile: { x: 7, y: 8 }, flags: emptyFlags() })?.id,
    ).toBe('a');
  });
});

describe('activeEncounters', () => {
  const here = makeEncounter({ id: 'here' });
  const elsewhere = makeEncounter({ id: 'elsewhere', regionId: 'saltreach', tile: { x: 1, y: 1 } });
  const gated = makeEncounter({ id: 'gated', tile: { x: 2, y: 2 }, requires: { allOf: ['arc'] } });
  const all = [here, elsewhere, gated];

  it('returns unresolved, requirement-met encounters in the region', () => {
    const active = activeEncounters(all, 'greybridge', emptyFlags());
    expect(active.map((e) => e.id)).toEqual(['here']);
  });

  it('includes a gated encounter once its requirement is met', () => {
    const active = activeEncounters(all, 'greybridge', flagsFromArray(['arc']));
    expect(active.map((e) => e.id).sort()).toEqual(['gated', 'here']);
  });

  it('drops an encounter once it is resolved', () => {
    const active = activeEncounters(all, 'greybridge', flagsFromArray(['enc_paid']));
    expect(active.map((e) => e.id)).toEqual([]);
  });

  it('only returns encounters for the queried region', () => {
    const active = activeEncounters(all, 'saltreach', emptyFlags());
    expect(active.map((e) => e.id)).toEqual(['elsewhere']);
  });
});

describe('validateEncounter', () => {
  it('accepts a well-formed encounter', () => {
    expect(validateEncounter(makeEncounter())).toEqual([]);
  });

  it('flags an encounter with no outcomes', () => {
    const broken = makeEncounter({ outcomes: {} });
    expect(validateEncounter(broken).some((m) => m.includes('no outcomes'))).toBe(true);
  });

  it('flags a resolution flag no choice sets', () => {
    const broken = makeEncounter({
      outcomes: { enc_paid: { coins: -10 }, enc_unreachable: {} },
    });
    expect(validateEncounter(broken).some((m) => m.includes('enc_unreachable'))).toBe(true);
  });

  it('flags a dialogue whose choice points to a missing node', () => {
    const broken = makeEncounter({
      dialogue: {
        start: 'scene',
        nodes: {
          scene: {
            id: 'scene',
            speaker: 'Someone',
            text: 'x',
            choices: [{ label: 'go', set: ['enc_paid'], next: 'ghost' }],
          },
        },
      },
      outcomes: { enc_paid: {} },
    });
    expect(validateEncounter(broken).some((m) => m.includes('ghost'))).toBe(true);
  });

  it('flags a dialogue with no ending', () => {
    const broken = makeEncounter({
      dialogue: {
        start: 'scene',
        nodes: {
          scene: {
            id: 'scene',
            speaker: 'Someone',
            text: 'x',
            choices: [{ label: 'loop', set: ['enc_paid'], next: 'scene' }],
          },
        },
      },
      outcomes: { enc_paid: {} },
    });
    expect(validateEncounter(broken).some((m) => m.includes('ends the conversation'))).toBe(true);
  });
});
