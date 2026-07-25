import { describe, it, expect } from 'vitest';
import { restoreRunState } from '../../src/systems/run-state';
import type { GameSnapshot } from '../../src/systems/save-system';
import type { Contract } from '../../src/systems/contract-system';
import {
  DEFAULT_WAGON_TUNING,
  WAGON_TUNING,
  maxConditionForLevel,
} from '../../src/systems/wagon-condition';
import { FLAG_BLOCKADE_BROKEN } from '../../src/data/dialogue-content';

const TUNING = DEFAULT_WAGON_TUNING;

function contract(id: string, overrides: Partial<Contract> = {}): Contract {
  return {
    id,
    title: id,
    cargo: 'a letter',
    pickupId: 'home',
    destinationId: 'there',
    reward: 50,
    reputation: 2,
    minReputation: 0,
    note: '',
    ...overrides,
  };
}

const HERE = contract('here-1');
const REGION_CONTRACTS: readonly Contract[] = [HERE, contract('here-2')];

function snapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    coins: 0,
    reputation: {},
    unlocks: [],
    upgrades: [],
    completed: [],
    visited: [],
    regionId: 'greybridge',
    fogByRegion: {},
    fogDimsByRegion: {},
    activeContractId: null,
    contractStatus: null,
    distanceTiles: 0,
    deliveries: 0,
    wagonCondition: 100,
    achievements: [],
    skills: {},
    storyFlags: [],
    courierTile: null,
    ...overrides,
  };
}

function restore(snap: GameSnapshot | null, tuning = TUNING) {
  return restoreRunState({ snapshot: snap, tuning, regionContracts: REGION_CONTRACTS });
}

describe('restoreRunState: a fresh run', () => {
  it('reports itself as fresh, so the scene clears session-scoped state (#291)', () => {
    expect(restore(null).freshRun).toBe(true);
    // A region-travel restart passes a snapshot and must NOT be treated as fresh,
    // or a re-cleared region loses its dismissed-summary and telemetry dedup.
    expect(restore(snapshot()).freshRun).toBe(false);
  });

  it('starts on the small level-1 tank, sized by the chosen difficulty', () => {
    expect(restore(null).wagonCondition).toBe(maxConditionForLevel(1, TUNING));
    expect(restore(null).wagonCondition).toBe(25);
    // Demanding starts smaller, so the fresh tank has to come from the profile
    // rather than a constant.
    expect(restore(null, WAGON_TUNING.demanding).wagonCondition).toBe(16);
    expect(restore(null, WAGON_TUNING.relaxed).wagonCondition).toBe(40);
  });

  it('starts empty, with no contract in progress', () => {
    const run = restore(null);
    expect(run.state.unlocks.size).toBe(0);
    expect(run.state.upgrades.size).toBe(0);
    expect(run.state.ledger.coins).toBe(0);
    expect(run.completed.size).toBe(0);
    expect(run.visited.size).toBe(0);
    expect(run.achievements.size).toBe(0);
    expect(run.skills).toEqual({});
    expect(run.storyFlags.size).toBe(0);
    expect(run.trip).toEqual({ distanceTiles: 0, deliveries: 0 });
    expect(run.activeContract).toBeUndefined();
    expect(run.progress).toBeUndefined();
    expect(run.blockadeBrokenAtLoad).toBe(false);
    expect(run.fogByRegion).toEqual({});
  });
});

describe('restoreRunState: a loaded save', () => {
  it('restores the ledger, sets, and odometer', () => {
    const run = restore(
      snapshot({
        coins: 412,
        reputation: { greywater: 7 },
        unlocks: ['ford-crossing-greybridge'],
        upgrades: ['wheels'],
        completed: ['here-2'],
        visited: ['greywater', 'stonehollow'],
        achievements: ['first-delivery'],
        distanceTiles: 61.5,
        deliveries: 3,
      }),
    );
    expect(run.state.ledger.coins).toBe(412);
    expect(run.state.ledger.reputation).toEqual({ greywater: 7 });
    expect([...run.state.unlocks]).toEqual(['ford-crossing-greybridge']);
    expect([...run.state.upgrades]).toEqual(['wheels']);
    expect([...run.completed]).toEqual(['here-2']);
    expect(run.visited.size).toBe(2);
    expect([...run.achievements]).toEqual(['first-delivery']);
    expect(run.trip).toEqual({ distanceTiles: 61.5, deliveries: 3 });
  });

  // The tank grows with level, and level is derived from play stats rather than
  // stored, so the clamp has to compute it from the save's own numbers.
  it('clamps a loaded condition to the tank the loaded level affords', () => {
    // No stats: level 1, tank 25. An over-max saved condition is cut to it.
    expect(restore(snapshot({ wagonCondition: 90 })).wagonCondition).toBe(25);

    // 200 tiles is 200 xp, which is level 3 (xpForLevel(3) === 150), tank 43.
    const leveled = restore(snapshot({ wagonCondition: 90, distanceTiles: 200 }));
    expect(leveled.wagonCondition).toBe(43);
    expect(leveled.wagonCondition).toBe(maxConditionForLevel(3, TUNING));
  });

  it('leaves a condition within the tank untouched', () => {
    expect(restore(snapshot({ wagonCondition: 12 })).wagonCondition).toBe(12);
  });

  it('sanitizes skills against the live skill list', () => {
    const run = restore(
      snapshot({
        skills: {
          'off-road': 2,
          'no-such-skill': 3, // an id this build does not have
          wayfinder: 99, // above its maxRank
          cipher: 0, // a zero rank is not a rank
        },
      }),
    );
    expect(run.skills['off-road']).toBe(2);
    expect(run.skills['no-such-skill']).toBeUndefined();
    expect(run.skills.cipher).toBeUndefined();
    // Clamped to the skill's own maxRank rather than trusted.
    expect(run.skills.wayfinder).toBeLessThan(99);
    expect(run.skills.wayfinder).toBeGreaterThan(0);
  });

  it('records whether the blockade was already broken, so the capstone shows once', () => {
    expect(restore(snapshot({ storyFlags: [] })).blockadeBrokenAtLoad).toBe(false);
    expect(restore(snapshot({ storyFlags: ['some_other_flag'] })).blockadeBrokenAtLoad).toBe(false);
    expect(restore(snapshot({ storyFlags: [FLAG_BLOCKADE_BROKEN] })).blockadeBrokenAtLoad).toBe(
      true,
    );
  });
});

describe('restoreRunState: the active contract', () => {
  it('restores a contract that belongs to this region', () => {
    const run = restore(snapshot({ activeContractId: 'here-1', contractStatus: 'carrying' }));
    expect(run.activeContract).toBe(HERE);
    expect(run.progress).toEqual({ contractId: 'here-1', status: 'carrying' });
  });

  // The save is global but contracts are per-region, so a courier who saved mid-job
  // in Fenmarch and boots into Greybridge must not carry an unfinishable contract.
  it('drops a contract belonging to another region', () => {
    const run = restore(snapshot({ activeContractId: 'fenmarch-3', contractStatus: 'carrying' }));
    expect(run.activeContract).toBeUndefined();
    expect(run.progress).toBeUndefined();
  });

  it('drops a contract that is already completed', () => {
    const run = restore(
      snapshot({
        activeContractId: 'here-1',
        contractStatus: 'delivered',
        completed: ['here-1'],
      }),
    );
    expect(run.activeContract).toBeUndefined();
    expect(run.progress).toBeUndefined();
  });

  it('needs both an id and a status, since either alone is a half-written job', () => {
    expect(restore(snapshot({ activeContractId: 'here-1' })).activeContract).toBeUndefined();
    expect(restore(snapshot({ contractStatus: 'carrying' })).activeContract).toBeUndefined();
  });
});

describe('restoreRunState: fog', () => {
  it('restores the per-region fog and its recorded dimensions', () => {
    const run = restore(
      snapshot({
        fogByRegion: { greybridge: [0, 1, 5], fenmarch: [9] },
        fogDimsByRegion: { greybridge: [20, 15] },
      }),
    );
    expect(run.fogByRegion).toEqual({ greybridge: [0, 1, 5], fenmarch: [9] });
    expect(run.fogDimsByRegion).toEqual({ greybridge: [20, 15] });
  });

  // The scene mutates fogByRegion on every autosave. Handing back the snapshot's
  // own arrays would let those writes reach through into the loaded save object.
  it('copies the fog arrays rather than aliasing the snapshot', () => {
    const snap = snapshot({
      fogByRegion: { greybridge: [1, 2] },
      fogDimsByRegion: { greybridge: [20, 15] },
    });
    const run = restore(snap);
    run.fogByRegion.greybridge?.push(99);
    run.fogDimsByRegion.greybridge = [1, 1];
    expect(snap.fogByRegion.greybridge).toEqual([1, 2]);
    expect(snap.fogDimsByRegion.greybridge).toEqual([20, 15]);
  });
});
