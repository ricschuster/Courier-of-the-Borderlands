// Pure text builders for the remaining HUD panels: the contract board, the
// region-cleared summary, and the courier skills panel. Each takes plain input,
// composes the relevant pure systems, and returns the string the HUD renders.
// No Phaser or DOM here, so the formatting is unit testable. The scene keeps the
// show/hide decisions and the live state gathering. See journal-text.ts for the
// same pattern applied to the discoveries journal.

import { canAccept, type Contract } from './contract-system';
import { getCargoCategory } from './cargo-types';
import { bonusFor, describeBonus } from './contract-bonus';
import { computeRunSummary } from './run-summary';
import { rankOf, type Skill, type SkillRanks } from './skills';
import { reconnectionRewardMultiplier, type SettlementStatus } from './world-state';
import { upgradeEffectLabel, type Upgrade } from './upgrade-system';

export interface BoardTextInput {
  readonly homeName: string;
  /** Contracts currently offerable, in board order. */
  readonly contracts: readonly Contract[];
  readonly reputation: number;
  /** Connection status per settlement, so a reconnected destination shows its premium. */
  readonly worldStatus: Record<string, SettlementStatus>;
}

/** The contract board: a header and one line per offerable contract. */
export function boardText(input: BoardTextInput): string {
  const lines = [`${input.homeName.toUpperCase()} BOARD  (press number to accept)`];
  if (input.contracts.length === 0) {
    lines.push('  No contracts remain. The frontier is quiet, for now.');
  }
  input.contracts.forEach((contract, i) => {
    const locked = canAccept(contract, input.reputation)
      ? ''
      : `   [needs ${contract.minReputation} rep]`;
    const cargoTag = getCargoCategory(contract.cargoType).tag;
    // A reconnected destination pays a premium; show the boosted figure and by
    // how much, so the board reflects the world reacting to past deliveries.
    const mult = reconnectionRewardMultiplier(input.worldStatus[contract.destinationId]);
    const reward = Math.round(contract.reward * mult);
    const reconnectTag = mult > 1 ? `  (+${Math.round((mult - 1) * 100)}% reconnected)` : '';
    lines.push(
      `  [${i + 1}] ${contract.title}  -  ${reward}c, +${contract.reputation} rep${locked}  <${cargoTag}>${reconnectTag}`,
    );
    const bonus = bonusFor(contract.id);
    if (bonus !== undefined) {
      lines.push(`      ${describeBonus(bonus)}`);
    }
  });
  return lines.join('\n');
}

export interface SummaryTextInput {
  readonly regionName: string;
  readonly coins: number;
  readonly totalReputation: number;
  readonly reputationTier: string;
  readonly delivered: number;
  readonly totalContracts: number;
  readonly fordUnlocked: boolean;
  readonly upgradesOwned: number;
  readonly distanceText: string;
  /** Names of the regions reachable from here, for the travel prompt. */
  readonly gatewayNames: string;
}

/**
 * The region-cleared summary panel, or null when the region is not yet cleared
 * (all standing contracts delivered). The scene still owns whether a cleared
 * summary has been dismissed.
 */
export function summaryText(input: SummaryTextInput): string | null {
  const summary = computeRunSummary({
    regionName: input.regionName,
    coins: input.coins,
    totalReputation: input.totalReputation,
    reputationTier: input.reputationTier,
    delivered: input.delivered,
    totalContracts: input.totalContracts,
    fordUnlocked: input.fordUnlocked,
    upgradesOwned: input.upgradesOwned,
  });
  if (!summary.complete) {
    return null;
  }
  const lines = [
    `${input.regionName} Cleared`,
    '',
    ...summary.lines,
    `Distance driven: ${input.distanceText}`,
    '',
    `Reach the gateway and press T to travel to ${input.gatewayNames}.`,
    'Press N for a new run.  Esc to dismiss this panel.',
  ];
  return lines.join('\n');
}

export interface CapstoneTextInput {
  readonly courierTitle: string;
  readonly deliveries: number;
  readonly distanceText: string;
  /** Number of regions in the borderland, all reconnected by the time the arc ends. */
  readonly regionCount: number;
}

/**
 * The end-of-arc capstone panel, shown once when the courier breaks the
 * blockade. A ceremonial curtain after the resolution conversation: the journey
 * in numbers and a closing line, so the arc ends on more than a dialogue box
 * (Session 5 playtest: the ending felt nonceremonial).
 */
export function capstoneText(input: CapstoneTextInput): string {
  return [
    'THE BLOCKADE BROKEN',
    '',
    'Word runs the roads again, coast to fen, because a courier carried it.',
    '',
    `Regions reconnected: ${input.regionCount} of ${input.regionCount}`,
    `Deliveries made: ${input.deliveries}`,
    `Distance driven: ${input.distanceText}`,
    `Courier title: ${input.courierTitle}`,
    '',
    'Whoever cut these roads has lost the borderland.',
    'Your wheels are why.',
    '',
    'Esc to close.  N for a new run.',
  ].join('\n');
}

export interface SkillPanelTextInput {
  readonly level: number;
  readonly xpIntoLevel: number;
  readonly xpForNextLevel: number;
  readonly points: number;
  readonly skills: readonly Skill[];
  readonly ranks: SkillRanks;
}

/** The courier skills panel: level, points to spend, and each skill's rank. */
export function skillPanelText(input: SkillPanelTextInput): string {
  const lines = [
    'COURIER SKILLS   (K to close, mouse wheel to scroll)',
    `Level ${input.level}   XP ${input.xpIntoLevel} / ${input.xpForNextLevel}`,
    `Skill points to spend: ${input.points}`,
    '',
    'Press the number to invest a point:',
  ];
  input.skills.forEach((skill, i) => {
    const rank = rankOf(input.ranks, skill.id);
    const maxed = rank >= skill.maxRank ? '  (max)' : '';
    lines.push(`  [${i + 1}] ${skill.name}  rank ${rank}/${skill.maxRank}${maxed}`);
    lines.push(`        ${skill.description}`);
  });
  lines.push('', 'Level up by delivering, exploring, and covering ground.');
  return lines.join('\n');
}

export interface UpgradeMenuTextInput {
  readonly coins: number;
  /** All upgrades for the region, in menu (and number-key) order. */
  readonly upgrades: readonly Upgrade[];
  /** Ids of upgrades already fitted. */
  readonly purchased: ReadonlySet<string>;
}

/** The wagon upgrade menu: coins, then one entry per upgrade with cost, state, and effect. */
export function upgradeMenuText(input: UpgradeMenuTextInput): string {
  const lines = [
    'WAGON UPGRADES   (B to close, mouse wheel to scroll)',
    `Coins: ${input.coins}`,
    '',
    'Press the number to fit an upgrade:',
  ];
  input.upgrades.forEach((upgrade, i) => {
    const owned = input.purchased.has(upgrade.id);
    const state = owned
      ? '(fitted)'
      : input.coins >= upgrade.cost
        ? 'affordable'
        : `need ${upgrade.cost - input.coins} more coins`;
    lines.push(`  [${i + 1}] ${upgrade.name}  -  ${upgrade.cost}c   ${state}`);
    lines.push(`        ${upgradeEffectLabel(upgrade)}`);
  });
  lines.push('', 'Fitted upgrades stay with the wagon for the rest of the run.');
  return lines.join('\n');
}
