import { describe, it, expect } from 'vitest';
import { buildSnapshot, restoreRunState } from '../../src/systems/run-state';
import { createGameState } from '../../src/systems/game-state';
import { createTripLog } from '../../src/systems/trip-log';
import { flagsFromArray } from '../../src/systems/dialogue';
import { WAGON_TUNING } from '../../src/systems/wagon-condition';
import { getRegion } from '../../src/systems/region-system';
import { serialize, deserialize } from '../../src/systems/save-system';
import { FLAG_BLOCKADE_BROKEN } from '../../src/data/dialogue-content';

// Save/load symmetry (#392). The load direction has had a pure, tested home since
// #374; the save direction did not, so nothing could check the two halves against
// each other and a field added to one and not the other was silent.
//
// This matters more than it sounds. Every coverage hole the MapScene refactor
// turned up sat on the path that *reads state back*, not the path that creates
// it, and this is that path at its widest point.

const REGION = getRegion('greybridge');
const TUNING = WAGON_TUNING.standard;

/** A run with something in every field, so a dropped one cannot hide as a default. */
function fullRun() {
  const state = {
    ...createGameState(),
    ledger: { coins: 240, reputation: { greywater: 12, eastwatch: 5 } },
    unlocks: new Set(['ford-crossing-greybridge']),
    upgrades: new Set(['reinforced-wheels', 'far-lantern']),
  };

  // The carried contract must not also be a completed one: restoreRunState
  // deliberately drops a saved contract the run has already delivered, so a
  // fixture that used the same id for both would test that rule instead of the
  // round-trip.
  const [done, contract] = REGION.contracts;
  if (done === undefined || contract === undefined) {
    throw new Error('greybridge needs two contracts to build a fixture from');
  }

  return {
    state,
    completed: new Set([done.id]),
    visited: ['greywater', 'eastwatch'],
    trip: { ...createTripLog(), distanceTiles: 137.5, deliveries: 6 },
    regionId: 'greybridge',
    fogByRegion: { greybridge: [0, 1, 2, 30] },
    fogDimsByRegion: { greybridge: [REGION.rows[0]?.length ?? 0, REGION.rows.length] } as Record<
      string,
      [number, number]
    >,
    activeContract: contract,
    progress: { contractId: contract.id, status: 'carrying' as const },
    wagonCondition: 41,
    achievements: ['first-delivery'],
    skills: { wayfinder: 2, 'off-road': 1 },
    storyFlags: flagsFromArray([FLAG_BLOCKADE_BROKEN]),
    courierTile: { x: 7, y: 9 },
  };
}

describe('save and load round-trip', () => {
  it('carries every field of a live run back into the restored run', () => {
    const run = fullRun();
    const restored = restoreRunState({
      snapshot: buildSnapshot(run),
      tuning: TUNING,
      regionContracts: REGION.contracts,
    });

    expect(restored.state.ledger.coins).toBe(240);
    expect(restored.state.ledger.reputation).toEqual({ greywater: 12, eastwatch: 5 });
    expect([...restored.state.unlocks]).toEqual(['ford-crossing-greybridge']);
    expect([...restored.state.upgrades].sort()).toEqual(['far-lantern', 'reinforced-wheels']);
    expect([...restored.completed]).toEqual([...run.completed]);
    expect([...restored.visited].sort()).toEqual(['eastwatch', 'greywater']);
    expect(restored.trip.distanceTiles).toBeCloseTo(137.5);
    expect(restored.trip.deliveries).toBe(6);
    expect([...restored.achievements]).toEqual(['first-delivery']);
    expect(restored.skills).toEqual({ wayfinder: 2, 'off-road': 1 });
    expect(restored.fogByRegion.greybridge).toEqual([0, 1, 2, 30]);
    expect(restored.activeContract?.id).toBe(run.activeContract.id);
    expect(restored.progress?.status).toBe('carrying');
    expect(restored.blockadeBrokenAtLoad).toBe(true);
    expect(restored.freshRun).toBe(false);
  });

  it('survives the storage layer as well as the mapping', () => {
    // The full path a real save takes: build, serialize, parse, deserialize,
    // restore. Catches anything the JSON round-trip drops that the in-memory
    // round-trip above would not.
    const run = fullRun();
    const raw = JSON.parse(JSON.stringify(serialize(buildSnapshot(run))));
    const parsed = deserialize(raw);

    expect(parsed, 'a snapshot we just wrote must deserialize').not.toBeNull();

    const restored = restoreRunState({
      snapshot: parsed,
      tuning: TUNING,
      regionContracts: REGION.contracts,
    });

    expect(restored.state.ledger.coins).toBe(240);
    expect(restored.trip.deliveries).toBe(6);
    expect(restored.skills).toEqual({ wayfinder: 2, 'off-road': 1 });
    expect(restored.activeContract?.id).toBe(run.activeContract.id);
    expect(restored.fogByRegion.greybridge).toEqual([0, 1, 2, 30]);
  });

  it('clamps a condition the current tank can no longer afford', () => {
    // Not a pure round-trip: the load deliberately re-derives the tank from the
    // save's own play stats, so a condition saved under a bigger tank comes back
    // smaller. Pinned here so the asymmetry is intentional rather than a bug.
    const run = { ...fullRun(), wagonCondition: 100, trip: createTripLog(), visited: [] };
    const restored = restoreRunState({
      snapshot: buildSnapshot(run),
      tuning: TUNING,
      regionContracts: REGION.contracts,
    });

    expect(restored.wagonCondition).toBeLessThan(100);
    expect(restored.wagonCondition).toBe(TUNING.startingMaxCondition);
  });

  it('does not alias live run state into the snapshot', () => {
    // The snapshot goes to storage; if it aliased the run, a later mutation would
    // edit the "saved" data retroactively.
    const run = fullRun();
    const snapshot = buildSnapshot(run);

    run.state.upgrades.add('swift-team');
    run.completed.add('grain-to-southmill');
    // Cast: the live ledger is readonly by type but a real run replaces it
    // wholesale, and the point here is that the snapshot does not observe edits.
    (run.state.ledger.reputation as Record<string, number>).greywater = 999;

    expect(snapshot.upgrades).not.toContain('swift-team');
    expect(snapshot.completed).not.toContain('grain-to-southmill');
    expect(snapshot.reputation.greywater).toBe(12);
  });

  it('drops a saved contract that does not belong to the region being entered', () => {
    const run = fullRun();
    const restored = restoreRunState({
      snapshot: buildSnapshot(run),
      tuning: TUNING,
      // Arriving in a different region: the carried contract is not one of its own.
      regionContracts: getRegion('fenmarch').contracts,
    });

    expect(restored.activeContract).toBeUndefined();
    expect(restored.progress).toBeUndefined();
  });
});
