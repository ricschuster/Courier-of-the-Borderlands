// Pure composition layer that assembles the full discoveries-journal panel text.
//
// The journal is where the story lands: the current objective, per-place
// discovery and reconnection status, the active mission and its steps, the
// cross-region Hidden Road thread, a re-readable recent-events log, and the
// achievement checklist. buildJournal (journal.ts) owns the redacted place
// model; this module stitches that together with the mission, thread, and log
// sections into the single string the HUD renders.
//
// Content data (missions, achievements, thread regions) is injected as plain
// input rather than imported, so the assembly stays testable without pulling in
// the game's content modules and has no Phaser or DOM dependency.

import { buildJournal, statusLabel, type JournalInput } from './journal';
import {
  activeMission,
  missionProgress,
  stepRequirementCount,
  type Mission,
  type MissionState,
} from './mission-system';
import {
  hiddenRoadJournalLines,
  hiddenRoadProgress,
  type ThreadRegion,
} from './story-threads';
import { discoveryLines, type Discovery } from './discovery';
import type { StoryFlags } from './dialogue';

export interface JournalMissionInput {
  readonly missions: readonly Mission[];
  readonly state: MissionState;
  readonly regionId: string;
}

export interface JournalThreadsInput {
  readonly regions: readonly ThreadRegion[];
  readonly completedIds: ReadonlySet<string>;
  readonly flags: StoryFlags;
}

export interface JournalAchievementInput {
  readonly name: string;
  readonly earned: boolean;
}

export interface JournalDiscoveryInput {
  /** Discoveries already found in the current region, in list order. */
  readonly found: readonly Discovery[];
  /** Whether the courier can read the decoded cipher lines. */
  readonly hasCipher: boolean;
}

export interface JournalTextInput {
  /** Passed through to buildJournal for the redacted places and summary. */
  readonly journal: JournalInput;
  /** Courier title shown at the top of the panel. */
  readonly title: string;
  /** Pre-formatted distance-driven string. */
  readonly distanceText: string;
  readonly mission: JournalMissionInput;
  readonly threads: JournalThreadsInput;
  readonly discoveries: JournalDiscoveryInput;
  /** Recent story messages, oldest first (shown newest first). */
  readonly recentEvents: readonly string[];
  readonly achievements: readonly JournalAchievementInput[];
}

/** Story-spine lines: the active mission and its step progress. */
function missionLines(input: JournalMissionInput): string[] {
  const mission = activeMission(input.missions, input.state, input.regionId);
  if (mission === null) {
    return ['Story:', '  No mission calls just now. The borderland holds its breath.', ''];
  }
  const progress = missionProgress(mission, input.state);
  const lines = ['Story:', `  ${mission.title}`];
  progress.steps.forEach((entry, i) => {
    const mark = entry.done ? '[x]' : i === progress.currentStepIndex ? '[>]' : '[ ]';
    const count = stepRequirementCount(entry.step, input.state);
    const progressNote = !entry.done && count.total > 1 ? ` (${count.done}/${count.total})` : '';
    lines.push(`    ${mark} ${entry.step.summary}${progressNote}`);
  });
  lines.push('');
  return lines;
}

/**
 * Wayside-discovery lines: the lore found by revealing the fog in this region.
 * Empty until at least one is found, so it never hints at what has not been
 * uncovered. Each entry shows its title, note, and (with Cipher) decoded line.
 */
function discoverySection(input: JournalDiscoveryInput): string[] {
  if (input.found.length === 0) {
    return [];
  }
  const lines = ['Wayside discoveries:'];
  for (const discovery of input.found) {
    const [title, ...body] = discoveryLines(discovery, input.hasCipher);
    lines.push(`  ${title}`);
    for (const paragraph of body) {
      lines.push(`    ${paragraph}`);
    }
  }
  lines.push('');
  return lines;
}

/** Recent story log, newest first. Empty until anything has happened. */
function recentLines(recentEvents: readonly string[]): string[] {
  if (recentEvents.length === 0) {
    return [];
  }
  return ['Recent:', ...[...recentEvents].reverse().map((m) => `  ${m}`), ''];
}

/** Assemble the full discoveries-journal panel text. */
export function buildJournalText(input: JournalTextInput): string {
  const model = buildJournal(input.journal);
  const threadLines = hiddenRoadJournalLines(
    hiddenRoadProgress(input.threads.regions, input.threads.completedIds, input.threads.flags),
  );
  const lines = [
    'DISCOVERIES JOURNAL   (J to close, PgUp/PgDn or wheel to scroll)',
    `Title: ${input.title}`,
    '',
    'Current objective:',
    ...model.objectiveLines.map((l) => `  ${l}`),
    '',
    ...model.summaryLines,
    `Distance driven: ${input.distanceText}`,
    '',
    ...missionLines(input.mission),
    ...threadLines,
    ...discoverySection(input.discoveries),
    ...recentLines(input.recentEvents),
    'Places:',
  ];
  for (const place of model.places) {
    const label = statusLabel(place.status);
    const tag = label ? ` [${label}]` : '';
    lines.push(`  ${place.name}${tag} - ${place.note}`);
    if (place.statusNote) {
      lines.push(`      ${place.statusNote}`);
    }
  }
  lines.push('', 'Achievements:');
  for (const achievement of input.achievements) {
    lines.push(`  ${achievement.earned ? '[x]' : '[ ]'} ${achievement.name}`);
  }
  return lines.join('\n');
}
