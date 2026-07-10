// Pure module: cross-region story threads derived from delivery history.
//
// The arc-gated contracts (those with a `requires` flag, authored per region)
// are the hidden network's unsigned letters. On their own they read as loose
// extra work; this thread ties them together into one visible through-line for
// the journal, so a player can see the arc they are carrying across the whole
// borderland. Fully derived from completed contracts and story flags, matching
// world-state, missions, and experience: no new save state.
//
// It is data-driven: any contract marked `arc: true` counts, so new arc
// contracts join the thread automatically while ordinary reconnection-gated work
// stays out of it. No Phaser or DOM here, so it can be unit tested directly.

import { isContractAvailable, type Contract } from './contract-system';
import type { StoryFlags } from './dialogue';

/** A region's arc contracts, with the display name used in the journal. */
export interface ThreadRegion {
  readonly name: string;
  readonly contracts: readonly Contract[];
}

/** One arc contract's place in the thread. */
export interface HiddenRoadEntry {
  readonly regionName: string;
  readonly contractTitle: string;
  readonly done: boolean;
}

export interface HiddenRoadProgress {
  /** Total arc (flag-gated) contracts across all regions. */
  readonly total: number;
  /** How many have been delivered. */
  readonly done: number;
  readonly entries: readonly HiddenRoadEntry[];
  /**
   * Whether the courier has begun the thread: at least one arc contract has been
   * revealed (its gate met) or delivered. Kept separate so the journal can hide
   * the thread entirely until it starts, rather than pre-announcing the arc.
   */
  readonly started: boolean;
}

/** Derive Hidden Road progress from the regions' arc contracts and delivery history. */
export function hiddenRoadProgress(
  regions: readonly ThreadRegion[],
  completedIds: ReadonlySet<string>,
  flags: StoryFlags,
): HiddenRoadProgress {
  const entries: HiddenRoadEntry[] = [];
  let started = false;
  for (const region of regions) {
    for (const contract of region.contracts) {
      // Only the arc contracts (the unsigned letters) belong to the thread.
      // Ordinary reconnection-gated work is gated too but is not arc work.
      if (contract.arc !== true) {
        continue;
      }
      const done = completedIds.has(contract.id);
      // Revealed once its gate is met (available) or it is already delivered.
      if (done || isContractAvailable(contract, completedIds, flags)) {
        started = true;
      }
      entries.push({ regionName: region.name, contractTitle: contract.title, done });
    }
  }
  const done = entries.filter((e) => e.done).length;
  return { total: entries.length, done, entries, started };
}

/**
 * Journal lines for the Hidden Road thread. Empty until the thread has started
 * (so it does not spoil the arc), then a header, a count, and a checklist.
 */
export function hiddenRoadJournalLines(progress: HiddenRoadProgress): string[] {
  if (!progress.started || progress.total === 0) {
    return [];
  }
  const lines = [
    'The Hidden Road:',
    `  Unsigned letters carried: ${progress.done}/${progress.total}`,
  ];
  for (const entry of progress.entries) {
    lines.push(`    ${entry.done ? '[x]' : '[ ]'} ${entry.contractTitle} (${entry.regionName})`);
  }
  lines.push('');
  return lines;
}
