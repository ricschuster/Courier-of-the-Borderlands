// Pure end-of-run summary. No Phaser imports. No side effects.

export interface RunSummaryInput {
  readonly regionName: string;       // e.g. "Greybridge Region"
  readonly coins: number;
  readonly totalReputation: number;
  readonly reputationTier: string;   // e.g. "Honoured"
  readonly delivered: number;        // contracts delivered
  readonly totalContracts: number;
  readonly fordUnlocked: boolean;
  readonly upgradesOwned: number;
}

export interface RunSummary {
  readonly complete: boolean;        // true iff totalContracts > 0 && delivered >= totalContracts
  readonly title: string;            // "<Region> Cleared" when complete, else "Courier Ledger"
  readonly lines: readonly string[]; // human-readable stat lines for display
}

/** Build a human-readable run summary from end-of-run state. */
export function computeRunSummary(input: RunSummaryInput): RunSummary {
  const complete =
    input.totalContracts > 0 && input.delivered >= input.totalContracts;

  const title = complete ? `${input.regionName} Cleared` : 'Courier Ledger';

  const fordLine = input.fordUnlocked
    ? 'Ford shortcut: opened'
    : 'Ford shortcut: not opened';

  const lines: string[] = [
    `Contracts delivered: ${input.delivered} / ${input.totalContracts}`,
    `Coins: ${input.coins}`,
    `Reputation: ${input.totalReputation} (${input.reputationTier})`,
    fordLine,
    `Upgrades fitted: ${input.upgradesOwned}`,
  ];

  if (complete) {
    lines.push(`The roads of ${input.regionName} know your wheels now.`);
  }

  return { complete, title, lines };
}
