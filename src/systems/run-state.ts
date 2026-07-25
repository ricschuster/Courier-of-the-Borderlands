// Turning a loaded save into the run the scene starts from.
//
// The scene used to do this inline across roughly 70 lines of field assignment,
// which put every sanitizing rule out of reach of a unit test: what a fresh run
// starts with, what a loaded condition is clamped to, which skills survive a
// stale save, whether the saved contract belongs to this region. Two shipped
// bugs lived here (#291's session-state reset, #315's fog handling), so the
// rules are the part worth testing.
//
// This module owns the mapping and returns a plain object; the scene applies it
// to its fields. Nothing here touches storage or the save format: the snapshot
// arrives already deserialized and validated by save-system.ts, which stays the
// only place that knows about keys and versions (ADR 0008).

import { createGameState, type GameState } from './game-state';
import { ledgerFrom } from './economy';
import { createTripLog, type TripLog } from './trip-log';
import { levelForXp, totalXp } from './experience';
import { sanitizeRanks, type SkillRanks } from './skills';
import { emptyFlags, flagsFromArray, hasFlag, type StoryFlags } from './dialogue';
import { FLAG_BLOCKADE_BROKEN } from '../data/dialogue-content';
import {
  clampCondition,
  maxConditionForLevel,
  sanitizeCondition,
  type WagonTuning,
} from './wagon-condition';
import type { Contract, ContractProgress } from './contract-system';
import type { GameSnapshot } from './save-system';

export interface RestoreRunStateInput {
  /** Deserialized save, or null for a fresh run (new game or first boot). */
  readonly snapshot: GameSnapshot | null;
  /**
   * Difficulty profile in force. It has to be settled before restoring: a fresh
   * run derives its starting tank from this tuning, and a loaded condition is
   * clamped to the max that tuning affords.
   */
  readonly tuning: WagonTuning;
  /**
   * Contracts belonging to the region being entered, so a saved contract from
   * another region is not restored into this one.
   */
  readonly regionContracts: readonly Contract[];
}

/** The run the scene starts from, as plain data for it to apply to its fields. */
export interface RunState {
  readonly state: GameState;
  readonly completed: Set<string>;
  readonly visited: Set<string>;
  readonly trip: TripLog;
  readonly achievements: Set<string>;
  readonly skills: SkillRanks;
  readonly storyFlags: StoryFlags;
  readonly wagonCondition: number;
  /**
   * Whether the blockade was already broken in the save. Recorded per load so
   * the end-of-arc capstone never re-appears on a later load or after travel:
   * it was earned in an earlier session and the save already carries the flag.
   */
  readonly blockadeBrokenAtLoad: boolean;
  readonly fogByRegion: Record<string, number[]>;
  readonly fogDimsByRegion: Record<string, [number, number]>;
  readonly activeContract: Contract | undefined;
  readonly progress: ContractProgress | undefined;
  /**
   * True for a fresh run rather than a region-travel restart. The scene also
   * clears its session-scoped panel and telemetry dedup state in that case, so
   * a re-cleared region shows its panel and records its milestone again (#291).
   */
  readonly freshRun: boolean;
}

/**
 * Courier level implied by a save's own play stats. Experience is derived, not
 * stored, so the tank a loaded condition is clamped against has to be computed
 * from the loaded trip and discovery counts rather than read from the file.
 */
function levelFrom(trip: TripLog, visited: ReadonlySet<string>): number {
  return levelForXp(
    totalXp({
      deliveries: trip.deliveries,
      distanceTiles: trip.distanceTiles,
      discoveries: visited.size,
    }),
  );
}

/** Build the run to start from: a loaded save, or a fresh game when null. */
export function restoreRunState(input: RestoreRunStateInput): RunState {
  const { snapshot, tuning, regionContracts } = input;
  const state = createGameState();

  if (snapshot === null) {
    return {
      state,
      completed: new Set(),
      visited: new Set(),
      trip: createTripLog(),
      achievements: new Set(),
      skills: {},
      storyFlags: emptyFlags(),
      // A new game starts with the small level-1 tank; capacity grows with level.
      wagonCondition: maxConditionForLevel(1, tuning),
      blockadeBrokenAtLoad: false,
      fogByRegion: {},
      fogDimsByRegion: {},
      activeContract: undefined,
      progress: undefined,
      freshRun: true,
    };
  }

  snapshot.unlocks.forEach((id) => state.unlocks.add(id));
  state.upgrades = new Set(snapshot.upgrades);
  state.ledger = ledgerFrom(snapshot.coins, snapshot.reputation);

  const completed = new Set(snapshot.completed);
  const visited = new Set(snapshot.visited);
  const trip = createTripLog(snapshot.distanceTiles, snapshot.deliveries);
  const storyFlags = flagsFromArray(snapshot.storyFlags);

  const fogByRegion: Record<string, number[]> = {};
  for (const [regionId, indices] of Object.entries(snapshot.fogByRegion)) {
    fogByRegion[regionId] = [...indices];
  }
  const fogDimsByRegion: Record<string, [number, number]> = {};
  for (const [regionId, dims] of Object.entries(snapshot.fogDimsByRegion)) {
    fogDimsByRegion[regionId] = [dims[0], dims[1]];
  }

  // Restore the active contract only if it belongs to this region and has not
  // already been delivered, so a save carrying another region's contract (or a
  // completed one) starts with an empty slot instead of an unfinishable job.
  let activeContract: Contract | undefined;
  let progress: ContractProgress | undefined;
  if (snapshot.activeContractId !== null && snapshot.contractStatus !== null) {
    const contract = regionContracts.find((c) => c.id === snapshot.activeContractId);
    if (contract !== undefined && !completed.has(contract.id)) {
      activeContract = contract;
      progress = { contractId: contract.id, status: snapshot.contractStatus };
    }
  }

  return {
    state,
    completed,
    visited,
    trip,
    achievements: new Set(snapshot.achievements),
    // Sanitize against the current skill list so a stale or edited save cannot
    // grant unknown skills or over-max ranks.
    skills: sanitizeRanks({ ...snapshot.skills }),
    storyFlags,
    // Clamp a loaded condition to the tank size the courier's level affords, so
    // an edited or pre-capacity save cannot exceed it.
    wagonCondition: clampCondition(
      sanitizeCondition(snapshot.wagonCondition),
      maxConditionForLevel(levelFrom(trip, visited), tuning),
    ),
    blockadeBrokenAtLoad: hasFlag(storyFlags, FLAG_BLOCKADE_BROKEN),
    fogByRegion,
    fogDimsByRegion,
    activeContract,
    progress,
    freshRun: false,
  };
}
