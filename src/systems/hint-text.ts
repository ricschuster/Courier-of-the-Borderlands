// Pure text builders for the control-hint line along the bottom of the screen.
//
// Two alternatives share that strip: the world hint, listing the keys that do
// something where the courier is standing, and the modal hint, listing the keys
// that still work while a panel or conversation owns the screen (#355). They sit
// together because they are the same surface in two states, and because the pair
// has to stay consistent about which keys it claims are live. The scene decides
// which one to build and gathers the live state, as it does for panel-text.ts
// and journal-text.ts.

import { isStranded, repairCost, type RepairHelpInput } from './wagon-condition';

/** The modal surfaces that take over input, in the order the scene checks them. */
export type ModalSurface = 'dialogue' | 'journal' | 'skills' | 'codex' | 'upgrades';

export interface ModalHintInput {
  readonly surface: ModalSurface;
  /** Whether the open panel actually scrolls, so the cue is not offered on a short one. */
  readonly scrollable: boolean;
  /** Whether number keys currently do something (rank a skill, fit an upgrade). */
  readonly numbersActive: boolean;
}

/**
 * Control hint for a modal surface (#355).
 *
 * The world hint cannot stand in while something modal is open: `update()`
 * returns early for both the dialogue and the blocking overlays, so the line
 * froze mid-sentence and went on advertising keys the freeze had made inert
 * ("WASD/arrows drive" under an open journal, with driving stopped). This
 * builds the line for what is actually on screen, listing only keys that work.
 */
export function modalHintText(input: ModalHintInput): string {
  if (input.surface === 'dialogue') {
    // The dialogue box states its own controls, so the hint line stays terse
    // rather than repeating them in a second place.
    return 'Esc: step away';
  }
  const closeKey: Record<Exclude<ModalSurface, 'dialogue'>, string> = {
    journal: 'J',
    skills: 'K',
    codex: 'L',
    upgrades: 'B',
  };
  const segments = [`Esc or ${closeKey[input.surface]}: close`];
  if (input.scrollable) {
    segments.push('PgUp/PgDn: scroll');
  }
  if (input.numbersActive) {
    segments.push(input.surface === 'skills' ? 'Number: rank a skill' : 'Number: fit an upgrade');
  }
  return segments.join('   ');
}

/**
 * The wagon repair/rescue segment of the world hint, or null when the wagon is
 * in full repair and there is nothing to act on. Condition itself is shown by
 * the HUD meter (#203); this carries only the actionable cost and key, so it
 * sits with the other contextual cues rather than duplicating the meter.
 *
 * Takes the same input as `repairHelpText`, its counterpart: this quotes the
 * price before the press, that one explains a press which could not pay it.
 */
export function wagonHintText(input: RepairHelpInput): string | null {
  const { atSettlement, condition, max, tuning } = input;
  const cost = repairCost(condition, max, tuning);
  // R quotes a full restore, not a small top-up: name it "full repair" and show
  // the per-point rate so the cost is legible before pressing, since a single R
  // can otherwise spend most of the purse without warning (#320).
  const rate = tuning.costPerPercent;
  if (isStranded(condition)) {
    return atSettlement
      ? `R: full repair ${cost}c (${rate}c/pt)`
      : `R: pay ${tuning.rescueCost}c rescue (or limp to a town)`;
  }
  if (condition >= max) {
    return null;
  }
  // Damaged: always show what a full repair would cost, so the player can plan
  // before reaching a town; press R to do it once on a settlement.
  return atSettlement
    ? `R: full repair ${cost}c (${rate}c/pt)`
    : `full repair ${cost}c at a town (${rate}c/pt)`;
}

export interface WorldHintInput {
  /** Settlement the courier can start a conversation with here, or null. */
  readonly talkTarget: string | null;
  /** Wagon facts behind the repair/rescue segment. */
  readonly wagon: RepairHelpInput;
  /** Region a gateway under the courier leads to, or null when travel is not offered. */
  readonly travelTarget: string | null;
  /** The courier is at the home settlement, where the board and the shop are. */
  readonly atHome: boolean;
  /** Some upgrade is still unfitted, so B is worth pointing at. */
  readonly upgradesAvailable: boolean;
  /** A skill point is banked, so K would do something. */
  readonly skillPointsAvailable: boolean;
  /** The toast queue's dismiss cue, or null while no message is up. */
  readonly toastHint: string | null;
}

/**
 * Build the control-hint line from where the player is standing, rather than
 * printing every key every frame. The dense concatenated string read as noise
 * (2026-07-12 playtest, docs/design/08_ui_and_onboarding.md): now driving is
 * always shown, and only the keys relevant to the current context appear
 * (upgrades at home, exploration on the road, travel at a gateway, dismiss
 * while a message is up).
 */
export function worldHintText(input: WorldHintInput): string {
  const segments: string[] = ['WASD/arrows drive.'];

  if (input.talkTarget !== null) {
    segments.push(`E: talk to ${input.talkTarget}`);
  }

  // Only when there is something to do (worn or stranded).
  const wagonSegment = wagonHintText(input.wagon);
  if (wagonSegment !== null) {
    segments.push(wagonSegment);
  }

  if (input.travelTarget !== null) {
    // Gateways sit on open road, off any town, so the travel cue is unambiguous.
    segments.push(`T: travel to ${input.travelTarget}`);
  }

  if (input.atHome) {
    // At home the board is open: point at the upgrade menu while any upgrade
    // is still unfitted.
    if (input.upgradesAvailable) {
      segments.push('B: upgrades');
    }
  } else {
    // On the road the useful keys are the exploration references.
    segments.push('M: map', 'J: journal', 'L: codex');
  }

  // Skills are only actionable once a point is banked; show K only then.
  if (input.skillPointsAvailable) {
    segments.push('K: skills');
  }

  // Only cue the dismiss key while a toast is actually up (Session 5 playtest:
  // messages now hold until Space). The cue carries the waiting count, since a
  // queue is otherwise invisible: the player cannot tell that Space reveals
  // another message rather than returning to a quiet screen (#327).
  if (input.toastHint !== null) {
    segments.push(input.toastHint);
  }

  segments.push('N: new game');
  return segments.join('   ');
}
