// Pure model for the player's discoveries journal.
// Builds a redacted view of the world from what the courier has actually found.
// Undiscovered places are masked so no real names, lore, or status leak through.
//
// The journal is also where the story lands: it holds the current objective so
// it can be re-read (the mission popup is easy to miss), and each discovered
// place shows whether the courier has reconnected it to the network. A
// reconnected place shows its spine payoff line, so a delivery reads as having
// changed the world. See docs/design/05_playtest_notes.md.

import type { SettlementStatus } from './world-state';

/** Status as the journal reports it: 'unknown' until the place is discovered. */
export type JournalStatus = SettlementStatus | 'unknown';

export interface JournalPlace {
  readonly discovered: boolean;
  readonly name: string;        // real name if discovered, else "???"
  readonly note: string;        // real lore note if discovered, else "Undiscovered."
  readonly status: JournalStatus; // 'unknown' until discovered
  readonly statusNote: string;  // spine payoff line if reconnected, else ""
}

export interface JournalSettlementInput {
  readonly id: string;
  readonly name: string;
  readonly note: string;
  readonly status: SettlementStatus;
  /** Spine payoff line, shown only once the place is discovered and reconnected. */
  readonly reconnectedNote: string;
}

export interface JournalInput {
  readonly settlements: readonly JournalSettlementInput[];
  readonly visitedIds: readonly string[];
  readonly delivered: number;
  readonly totalContracts: number;
  readonly reputationTier: string;
  readonly fordUnlocked: boolean;
  /** The current contract, if any, so the objective can be re-read. */
  readonly activeObjective: { readonly title: string; readonly detail: string } | null;
}

export interface JournalModel {
  readonly places: readonly JournalPlace[]; // one per settlement, in input order
  readonly summaryLines: readonly string[]; // short progress lines
  readonly objectiveLines: readonly string[]; // re-readable current objective
}

/** Human-readable label for a journal status. */
export function statusLabel(status: JournalStatus): string {
  switch (status) {
    case 'home':
      return 'Home';
    case 'reconnected':
      return 'Reconnected';
    case 'silent':
      return 'Silent';
    default:
      return '';
  }
}

/** Build a journal model from the current player state. */
export function buildJournal(input: JournalInput): JournalModel {
  const visitedSet = new Set(input.visitedIds);

  const places: JournalPlace[] = input.settlements.map((settlement) => {
    const discovered = visitedSet.has(settlement.id);
    if (!discovered) {
      // Mask everything, including status, so nothing leaks before discovery.
      return { discovered: false, name: '???', note: 'Undiscovered.', status: 'unknown', statusNote: '' };
    }
    return {
      discovered: true,
      name: settlement.name,
      note: settlement.note,
      status: settlement.status,
      statusNote: settlement.status === 'reconnected' ? settlement.reconnectedNote : '',
    };
  });

  const discoveredCount = places.filter((p) => p.discovered).length;
  const totalCount = input.settlements.length;

  // Reconnected progress. Only non-home settlements can be silent or
  // reconnected, so those two states define the denominator. A reconnected
  // place is always one the courier delivered to, hence always discovered, so
  // this leaks nothing.
  const reconnectable = places.filter((p) => p.status === 'silent' || p.status === 'reconnected').length;
  const reconnected = places.filter((p) => p.status === 'reconnected').length;

  const fordLine = input.fordUnlocked ? 'Ford shortcut: open' : 'Ford shortcut: sealed';

  const summaryLines: string[] = [
    `Places found: ${discoveredCount} / ${totalCount}`,
    `Contracts delivered: ${input.delivered} / ${input.totalContracts}`,
    `Standing: ${input.reputationTier}`,
    fordLine,
    `Reconnected: ${reconnected} / ${reconnectable}`,
  ];

  const objectiveLines: string[] = input.activeObjective
    ? [input.activeObjective.title, input.activeObjective.detail]
    : ['No active contract.', 'Visit a contract board to accept one.'];

  return { places, summaryLines, objectiveLines };
}
