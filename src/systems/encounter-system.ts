// Pure module: non-combat road encounters, built on the dialogue engine.
//
// An encounter is a Dialogue that fires when the courier reaches a specific
// tile, rather than by talking to a settlement NPC. It is one-shot: each
// encounter carries a set of resolution flags (the keys of its `outcomes`
// map), and once any of them is set the encounter never fires again. Because
// those flags are ordinary story flags, resolution persists through the save
// with no new save field, matching world-state, experience, and missions.
//
// Encounters add tension without combat (ADR 0004 section 6): a bandit toll you
// pay or refuse, a stranded traveller you help or pass, a washed-out crossing
// that warns you off a route. The choice's economic consequence (coins,
// reputation) lives in `outcomes`, keyed by the flag the choice sets, so the
// dialogue engine stays generic and content-free.
//
// No Phaser or DOM here, so the selection and outcome logic can be unit tested
// directly. The scene owns triggering (reading the courier tile each frame) and
// applying an outcome to its ledger.

import {
  conditionMet,
  validateDialogue,
  END_DIALOGUE,
  type Dialogue,
  type FlagCondition,
  type StoryFlags,
} from './dialogue';

/** A tile coordinate an encounter triggers on. */
export interface EncounterTile {
  readonly x: number;
  readonly y: number;
}

/**
 * The economic consequence of a resolution. All fields are optional and are
 * applied as deltas: `coins` may be negative (a toll), and `reputation` adjusts
 * standing with the settlement named by `reputationId`. An empty outcome is
 * valid: it resolves the encounter (one-shot) with no reward or cost, for a
 * purely narrative choice.
 */
export interface EncounterOutcome {
  /** Coin delta. Negative is a cost. The ledger clamps the result at zero. */
  readonly coins?: number;
  /** Settlement whose reputation changes. Required for `reputation` to apply. */
  readonly reputationId?: string;
  /** Reputation delta with `reputationId`. */
  readonly reputation?: number;
}

/** A road encounter: where it fires, what it says, and how each ending resolves. */
export interface RoadEncounter {
  readonly id: string;
  /** Short label for HUD hints and tests. */
  readonly title: string;
  /** Region the encounter belongs to. */
  readonly regionId: string;
  /** Tile that triggers the encounter when the courier reaches it. */
  readonly tile: EncounterTile;
  /** The conversation to play. Its terminal choices set resolution flags. */
  readonly dialogue: Dialogue;
  /**
   * Resolution flags mapped to their consequence. The keys double as the
   * one-shot markers: once any key is a set story flag, the encounter is spent.
   * Every ending of the dialogue should set exactly one of these.
   */
  readonly outcomes: Readonly<Record<string, EncounterOutcome>>;
  /**
   * Optional extra gate on story flags, beyond location and being unresolved.
   * Lets an encounter wait for a point in the arc before it can appear.
   */
  readonly requires?: FlagCondition;
}

/** The flags whose presence marks this encounter resolved (its outcome keys). */
export function resolutionFlags(encounter: RoadEncounter): readonly string[] {
  return Object.keys(encounter.outcomes);
}

/** True once any of the encounter's resolution flags is set. */
export function isEncounterResolved(encounter: RoadEncounter, flags: StoryFlags): boolean {
  return resolutionFlags(encounter).some((flag) => flags.has(flag));
}

/** The outcome for a resolution flag, or undefined if the flag is not one. */
export function outcomeForFlag(
  encounter: RoadEncounter,
  flagId: string,
): EncounterOutcome | undefined {
  return encounter.outcomes[flagId];
}

/** What the scene knows when checking for an encounter: where it is and the flags. */
export interface EncounterQuery {
  readonly regionId: string;
  readonly tile: EncounterTile;
  readonly flags: StoryFlags;
}

/**
 * The encounter that should fire for the given position and flags, or undefined
 * if none. An encounter fires when it is in the current region, its tile matches
 * the courier tile, its `requires` gate (if any) is met, and it is not already
 * resolved. The first match in list order wins.
 */
export function pickEncounter(
  encounters: readonly RoadEncounter[],
  query: EncounterQuery,
): RoadEncounter | undefined {
  return encounters.find(
    (encounter) =>
      encounter.regionId === query.regionId &&
      encounter.tile.x === query.tile.x &&
      encounter.tile.y === query.tile.y &&
      conditionMet(query.flags, encounter.requires) &&
      !isEncounterResolved(encounter, query.flags),
  );
}

/**
 * Encounters worth foreshadowing with a map marker: in the region, their
 * `requires` gate met, and not yet resolved. This is the same gate as
 * pickEncounter minus the tile match, so a marker appears exactly where driving
 * on would trigger something, and disappears once the encounter is spent (#184).
 * Fog still hides each marker until the courier reveals its tile.
 */
export function activeEncounters(
  encounters: readonly RoadEncounter[],
  regionId: string,
  flags: StoryFlags,
): RoadEncounter[] {
  return encounters.filter(
    (encounter) =>
      encounter.regionId === regionId &&
      conditionMet(flags, encounter.requires) &&
      !isEncounterResolved(encounter, flags),
  );
}

/**
 * Structural validation for authored encounters, mirroring validateDialogue.
 * Reports: an underlying dialogue that is malformed, an encounter with no
 * outcomes (so it could never resolve and would re-fire forever), and any
 * resolution flag that no choice actually sets (so it is unreachable). Returns
 * a list of messages, empty when the encounter is well formed. Never throws.
 */
export function validateEncounter(encounter: RoadEncounter): readonly string[] {
  const problems: string[] = [];

  for (const problem of validateDialogue(encounter.dialogue)) {
    problems.push(`dialogue node "${problem.nodeId}": ${problem.message}`);
  }

  const flags = resolutionFlags(encounter);
  if (flags.length === 0) {
    problems.push('has no outcomes, so it can never resolve and would fire forever');
  }

  const setByAChoice = new Set<string>();
  let hasEnding = false;
  for (const node of Object.values(encounter.dialogue.nodes)) {
    for (const choice of node.choices) {
      for (const id of choice.set ?? []) {
        setByAChoice.add(id);
      }
      if (choice.next === END_DIALOGUE) {
        hasEnding = true;
      }
    }
  }
  for (const flag of flags) {
    if (!setByAChoice.has(flag)) {
      problems.push(`resolution flag "${flag}" is never set by any choice`);
    }
  }
  if (!hasEnding) {
    problems.push('has no choice that ends the conversation');
  }

  return problems;
}
