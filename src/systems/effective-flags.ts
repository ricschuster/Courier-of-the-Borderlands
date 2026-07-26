// The story flags actually in force, saved ones plus everything derived from
// the current run.
//
// Extracted from MapScene in #392. The survey called this cluster a dependency
// cycle (boardContracts -> effectiveFlags -> regionCleared -> baseContractCounts
// -> completed) and treated it as the reason the contract group could not be
// taken. That framing was wrong: the cycle only exists if something tries to
// *own* the state. As a pure function that takes its inputs as arguments there
// is no cycle at all, just a derivation, and the caller already holds every
// input.

import { setFlags, type StoryFlags } from './dialogue';
import { derivedSkillFlags, type SkillRanks } from './skills';
import { reconnectedFlag, type SettlementStatus } from './world-state';
import { baseContracts, type Contract } from './contract-system';
import { FLAG_HOME_RECONNECTED } from '../data/dialogue-content';

/**
 * Whether a region counts as cleared: every standing (ungated) route delivered.
 *
 * Deliberately ignores gated contracts. The derived home_reconnected flag is
 * built on this, and the arc's reveals unlock gated contracts, so counting those
 * would re-lock the reveals the moment they opened new work.
 *
 * An empty region is never "cleared", which stops a region with no standing
 * routes from emitting the flag for free.
 */
export function isRegionCleared(
  contracts: readonly Contract[],
  completed: ReadonlySet<string>,
): boolean {
  const base = baseContracts(contracts);
  return base.length > 0 && base.every((c) => completed.has(c.id));
}

/** Delivered and total counts for a region's standing routes. */
export function baseContractCounts(
  contracts: readonly Contract[],
  completed: ReadonlySet<string>,
): { delivered: number; total: number } {
  const base = baseContracts(contracts);
  return {
    delivered: base.filter((c) => completed.has(c.id)).length,
    total: base.length,
  };
}

export interface EffectiveFlagsInput {
  /** Flags set through dialogue and mission progress, as saved. */
  readonly storyFlags: StoryFlags;
  /** Owned skills each contribute a flag, so dialogue can gate on them. */
  readonly skills: SkillRanks;
  /** Whether the region's standing routes are all delivered. */
  readonly regionCleared: boolean;
  /** Connection status per settlement, derived from delivery history. */
  readonly worldState: Readonly<Record<string, SettlementStatus>>;
}

/**
 * Saved flags plus the ones the current run implies.
 *
 * Derived flags are never persisted: they are recomputed from state that is
 * itself saved, so a change to the derivation rules applies to old saves
 * immediately instead of leaving them with a stale flag set.
 */
export function effectiveFlags(input: EffectiveFlagsInput): StoryFlags {
  const derived: string[] = [...derivedSkillFlags(input.skills)];

  if (input.regionCleared) {
    derived.push(FLAG_HOME_RECONNECTED);
  }

  // A reconnected place emits its own flag, so second-wave work can open on the
  // board the moment a region starts reviving (M5.4, Session 5).
  for (const [id, status] of Object.entries(input.worldState)) {
    if (status === 'reconnected') {
      derived.push(reconnectedFlag(id));
    }
  }

  return setFlags(input.storyFlags, derived);
}
