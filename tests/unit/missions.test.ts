import { describe, it, expect } from 'vitest';
import { MISSIONS } from '../../src/data/missions';
import {
  activeMission,
  activeObjective,
  missionComplete,
  missionAvailable,
  type MissionState,
} from '../../src/systems/mission-system';
import {
  FLAG_MET_POSTMASTER,
  FLAG_GREYBRIDGE_REVEAL,
  FLAG_SALTREACH_METHOD,
  FLAG_FENMARCH_COST,
  FLAG_BLOCKADE_BROKEN,
} from '../../src/data/dialogue-content';
import { CONTRACTS_GREYBRIDGE } from '../../src/data/contracts-greybridge';
import { SALTREACH_CONTRACTS, SALTREACH_SETTLEMENTS } from '../../src/data/region-saltreach';
import { FENMARCH_CONTRACTS, FENMARCH_SETTLEMENTS } from '../../src/data/region-fenmarch';
import { SETTLEMENTS } from '../../src/data/settlements-greybridge';
import { baseContracts, type Contract } from '../../src/systems/contract-system';

const ALL_CONTRACT_IDS = new Set([
  ...CONTRACTS_GREYBRIDGE.map((c) => c.id),
  ...SALTREACH_CONTRACTS.map((c) => c.id),
  ...FENMARCH_CONTRACTS.map((c) => c.id),
]);

const ALL_SETTLEMENT_IDS = new Set([
  ...Object.keys(SETTLEMENTS),
  ...Object.keys(SALTREACH_SETTLEMENTS),
  ...Object.keys(FENMARCH_SETTLEMENTS),
]);

const KNOWN_FLAGS = new Set([
  FLAG_MET_POSTMASTER,
  FLAG_GREYBRIDGE_REVEAL,
  FLAG_SALTREACH_METHOD,
  FLAG_FENMARCH_COST,
  FLAG_BLOCKADE_BROKEN,
]);

function state(partial: Partial<{ contracts: string[]; flags: string[]; visited: string[] }>): MissionState {
  return {
    completedContractIds: partial.contracts ?? [],
    flags: new Set(partial.flags ?? []),
    visitedIds: partial.visited ?? [],
  };
}

describe('missions data integrity', () => {
  it('every referenced contract id exists', () => {
    for (const mission of MISSIONS) {
      for (const step of mission.steps) {
        for (const id of step.requires.contractsCompleted ?? []) {
          expect(ALL_CONTRACT_IDS.has(id), `${mission.id}/${step.id}: contract ${id}`).toBe(true);
        }
      }
    }
  });

  it('every referenced settlement id exists', () => {
    for (const mission of MISSIONS) {
      for (const step of mission.steps) {
        for (const id of step.requires.visited ?? []) {
          expect(ALL_SETTLEMENT_IDS.has(id), `${mission.id}/${step.id}: settlement ${id}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('every referenced flag is a known story flag (guards against typos)', () => {
    for (const mission of MISSIONS) {
      const reqFlags = [
        ...(mission.requires?.flags ?? []),
        ...mission.steps.flatMap((s) => s.requires.flags ?? []),
      ];
      for (const flag of reqFlags) {
        expect(KNOWN_FLAGS.has(flag), `${mission.id}: flag ${flag}`).toBe(true);
      }
    }
  });

  it('has unique mission ids', () => {
    const ids = MISSIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Region-clear is computed from the base (ungated) contracts, while the story
  // spine is authored per step. If the two drift apart, a region reads as
  // "cleared" on a route the mission never asked for (the Reedgrave/Saltmere/
  // Fenholt bug) or a mission demands a route that clear does not count. This
  // guards that every base route is on the spine and nothing gated is required.
  const REGION_CONTRACTS: ReadonlyArray<readonly [string, readonly Contract[]]> = [
    ['greybridge', CONTRACTS_GREYBRIDGE],
    ['saltreach', SALTREACH_CONTRACTS],
    ['fenmarch', FENMARCH_CONTRACTS],
  ];
  for (const [regionId, contracts] of REGION_CONTRACTS) {
    it(`${regionId}: mission-required contracts match the region's base routes`, () => {
      const baseIds = baseContracts(contracts)
        .map((c) => c.id)
        .sort();
      const missionIds = [
        ...new Set(
          MISSIONS.filter((m) => m.regionId === regionId).flatMap((m) =>
            m.steps.flatMap((s) => s.requires.contractsCompleted ?? []),
          ),
        ),
      ].sort();
      expect(missionIds).toEqual(baseIds);
    });
  }
});

describe('greybridge spine advances through play', () => {
  it('starts by asking the courier to meet the postmaster', () => {
    const objective = activeObjective(MISSIONS, state({}), 'greybridge');
    expect(objective?.mission.id).toBe('greybridge-silence');
    expect(objective?.step.id).toBe('meet');
  });

  it('advances to the first letter once the postmaster is met', () => {
    const objective = activeObjective(MISSIONS, state({ flags: [FLAG_MET_POSTMASTER] }), 'greybridge');
    expect(objective?.step.id).toBe('first-letter');
  });

  it('advances to reconnecting the region after the first delivery', () => {
    const objective = activeObjective(
      MISSIONS,
      state({ flags: [FLAG_MET_POSTMASTER], contracts: ['letters-to-eastwatch'] }),
      'greybridge',
    );
    expect(objective?.step.id).toBe('reconnect');
  });

  it('asks for the return to the postmaster once every contract is delivered', () => {
    const objective = activeObjective(
      MISSIONS,
      state({
        flags: [FLAG_MET_POSTMASTER],
        contracts: [
          'letters-to-eastwatch',
          'grain-to-southmill',
          'rumours-to-ironhollow',
          'writ-to-northcairn',
          'secret-to-mirewatch',
          'secret-to-reedgrave',
        ],
      }),
      'greybridge',
    );
    expect(objective?.step.id).toBe('reveal');
  });
});

describe('spoke missions gate on the hub reveal', () => {
  it('are unavailable before the Greybridge reveal', () => {
    const before = state({});
    const saltreach = MISSIONS.find((m) => m.id === 'saltreach-method');
    const fenmarch = MISSIONS.find((m) => m.id === 'fenmarch-cost');
    expect(saltreach && missionAvailable(saltreach, before)).toBe(false);
    expect(fenmarch && missionAvailable(fenmarch, before)).toBe(false);
  });

  it('become available once the reveal is known', () => {
    const after = state({ flags: [FLAG_GREYBRIDGE_REVEAL] });
    const saltreach = MISSIONS.find((m) => m.id === 'saltreach-method');
    expect(saltreach && missionAvailable(saltreach, after)).toBe(true);
    // In Saltreach, that mission is the one surfaced.
    expect(activeMission(MISSIONS, after, 'saltreach')?.id).toBe('saltreach-method');
  });
});

describe('the capstone resolves the arc', () => {
  it('is unavailable until both spoke reveals are known', () => {
    const capstone = MISSIONS.find((m) => m.id === 'greybridge-answer');
    if (capstone === undefined) {
      throw new Error('expected the capstone mission');
    }
    expect(missionAvailable(capstone, state({ flags: [FLAG_SALTREACH_METHOD] }))).toBe(false);
    expect(
      missionAvailable(capstone, state({ flags: [FLAG_SALTREACH_METHOD, FLAG_FENMARCH_COST] })),
    ).toBe(true);
  });

  it('completes once the blockade-broken flag is set', () => {
    const capstone = MISSIONS.find((m) => m.id === 'greybridge-answer');
    if (capstone === undefined) {
      throw new Error('expected the capstone mission');
    }
    const resolved = state({
      flags: [FLAG_SALTREACH_METHOD, FLAG_FENMARCH_COST, FLAG_BLOCKADE_BROKEN],
    });
    expect(missionComplete(capstone, resolved)).toBe(true);
  });
});
