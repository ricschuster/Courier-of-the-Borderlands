// Pure model for the player's discoveries journal.
// Builds a redacted view of the world from what the courier has actually found.
// Undiscovered places are masked so no real names or lore leak through.

export interface JournalPlace {
  readonly discovered: boolean;
  readonly name: string;  // real name if discovered, else "???"
  readonly note: string;  // real lore note if discovered, else "Undiscovered."
}

export interface JournalInput {
  readonly settlements: readonly {
    readonly id: string;
    readonly name: string;
    readonly note: string;
  }[];
  readonly visitedIds: readonly string[];
  readonly delivered: number;
  readonly totalContracts: number;
  readonly reputationTier: string;
  readonly fordUnlocked: boolean;
}

export interface JournalModel {
  readonly places: readonly JournalPlace[];     // one per settlement, in input order
  readonly summaryLines: readonly string[];     // short progress lines
}

/** Build a journal model from the current player state. */
export function buildJournal(input: JournalInput): JournalModel {
  const visitedSet = new Set(input.visitedIds);

  const places: JournalPlace[] = input.settlements.map((settlement) => {
    const discovered = visitedSet.has(settlement.id);
    return discovered
      ? { discovered: true, name: settlement.name, note: settlement.note }
      : { discovered: false, name: '???', note: 'Undiscovered.' };
  });

  const discoveredCount = places.filter((p) => p.discovered).length;
  const totalCount = input.settlements.length;
  const fordLine = input.fordUnlocked ? 'Ford shortcut: open' : 'Ford shortcut: sealed';

  const summaryLines: string[] = [
    `Places found: ${discoveredCount} / ${totalCount}`,
    `Contracts delivered: ${input.delivered} / ${input.totalContracts}`,
    `Standing: ${input.reputationTier}`,
    fordLine,
  ];

  return { places, summaryLines };
}
