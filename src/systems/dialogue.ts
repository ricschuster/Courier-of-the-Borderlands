// Pure module: a generic, data-driven branching dialogue engine with story
// flags. No story content lives here. This is engine only, so missions,
// road encounters, and NPC chatter can all be authored as plain data on top
// of it. No Phaser or DOM here so it can be unit tested directly.

/** A story flag id. Presence in a StoryFlags set means the flag is set. */
export type StoryFlags = ReadonlySet<string>;

/** Create an empty flag set. */
export function emptyFlags(): StoryFlags {
  return new Set<string>();
}

/** Build a flag set from a plain array, for example when loading a save. */
export function flagsFromArray(ids: readonly string[]): StoryFlags {
  return new Set(ids);
}

/** Serialize a flag set to a plain array, for example when writing a save. */
export function flagsToArray(flags: StoryFlags): readonly string[] {
  return Array.from(flags);
}

export function hasFlag(flags: StoryFlags, id: string): boolean {
  return flags.has(id);
}

/**
 * Return a new flag set with the given ids added. Never mutates the input.
 * Ids already present are left as is.
 */
export function setFlags(flags: StoryFlags, ids: readonly string[]): StoryFlags {
  if (ids.length === 0) {
    return flags;
  }
  const next = new Set(flags);
  for (const id of ids) {
    next.add(id);
  }
  return next;
}

/**
 * A condition on story flags gating a choice. `allOf` lists flags that must
 * all be set. `noneOf` lists flags that must all be unset. Either list may
 * be omitted, which means no constraint from that list.
 */
export interface FlagCondition {
  readonly allOf?: readonly string[];
  readonly noneOf?: readonly string[];
}

/** True when the flag set satisfies the condition. Undefined condition always passes. */
export function conditionMet(flags: StoryFlags, condition: FlagCondition | undefined): boolean {
  if (condition === undefined) {
    return true;
  }
  const allOf = condition.allOf ?? [];
  const noneOf = condition.noneOf ?? [];
  for (const id of allOf) {
    if (!hasFlag(flags, id)) {
      return false;
    }
  }
  for (const id of noneOf) {
    if (hasFlag(flags, id)) {
      return false;
    }
  }
  return true;
}

/** Sentinel marking the end of a conversation, in place of a next node id. */
export const END_DIALOGUE = 'end-dialogue' as const;
export type EndDialogue = typeof END_DIALOGUE;

export interface DialogueChoice {
  readonly label: string;
  /** Gate on the current story flags. Omitted means always available. */
  readonly requires?: FlagCondition;
  /** Flags to set when this choice is taken. Omitted means no flags change. */
  readonly set?: readonly string[];
  /** Node id to move to, or END_DIALOGUE to close the conversation. */
  readonly next: string | EndDialogue;
}

export interface DialogueNode {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
  readonly choices: readonly DialogueChoice[];
}

export interface Dialogue {
  readonly nodes: Readonly<Record<string, DialogueNode>>;
  readonly start: string;
}

/** Look up a node by id. Undefined when the dialogue has no such node. */
export function getNode(dialogue: Dialogue, nodeId: string): DialogueNode | undefined {
  return dialogue.nodes[nodeId];
}

/** The start node of a dialogue, or undefined if the start id is dangling. */
export function startDialogue(dialogue: Dialogue): DialogueNode | undefined {
  return getNode(dialogue, dialogue.start);
}

/**
 * The choices on a node that are available given the current story flags.
 * Keeps the original order and does not mutate the node.
 */
export function availableChoices(
  node: DialogueNode,
  flags: StoryFlags,
): readonly DialogueChoice[] {
  return node.choices.filter((choice) => conditionMet(flags, choice.requires));
}

/** Result of choosing a DialogueChoice: what happens next, and the new flags. */
export interface ChoiceResult {
  readonly next: string | EndDialogue;
  readonly flags: StoryFlags;
}

/**
 * Apply a choice: compute the new flag set (immutably) and the next node id
 * or the end signal. Does not check that the choice was available; callers
 * should filter with availableChoices first.
 */
export function chooseOption(flags: StoryFlags, choice: DialogueChoice): ChoiceResult {
  const nextFlags = setFlags(flags, choice.set ?? []);
  return { next: choice.next, flags: nextFlags };
}

export interface DialogueProblem {
  readonly nodeId: string;
  readonly message: string;
}

/**
 * Cheap structural validation: every choice's `next` must point to a real
 * node or be END_DIALOGUE, and the dialogue's start must point to a real
 * node. Returns a list of problems, empty when the dialogue is well formed.
 * Never throws.
 */
export function validateDialogue(dialogue: Dialogue): readonly DialogueProblem[] {
  const problems: DialogueProblem[] = [];

  if (getNode(dialogue, dialogue.start) === undefined) {
    problems.push({
      nodeId: dialogue.start,
      message: `start node "${dialogue.start}" does not exist`,
    });
  }

  for (const node of Object.values(dialogue.nodes)) {
    for (const choice of node.choices) {
      if (choice.next === END_DIALOGUE) {
        continue;
      }
      if (getNode(dialogue, choice.next) === undefined) {
        problems.push({
          nodeId: node.id,
          message: `choice "${choice.label}" points to missing node "${choice.next}"`,
        });
      }
    }
  }

  return problems;
}
