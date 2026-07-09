import { describe, it, expect } from 'vitest';
import {
  emptyFlags,
  flagsFromArray,
  flagsToArray,
  hasFlag,
  setFlags,
  conditionMet,
  getNode,
  startDialogue,
  availableChoices,
  chooseOption,
  validateDialogue,
  nodeText,
  END_DIALOGUE,
  type Dialogue,
  type DialogueNode,
  type StoryFlags,
} from '../../src/systems/dialogue';

// Fixture mirroring the storyline spine's shape: a Greywater postmaster
// conversation whose accepted choice sets the greybridge_reveal flag.
const POSTMASTER_DIALOGUE: Dialogue = {
  start: 'greet',
  nodes: {
    greet: {
      id: 'greet',
      speaker: 'Greywater Postmaster',
      text: 'Eastwatch has gone quiet, and quiet is rarely good.',
      choices: [
        {
          label: 'What do you mean?',
          next: 'explain',
        },
        {
          label: 'I already know about the blockade.',
          requires: { allOf: ['greybridge_reveal'] },
          next: 'already-know',
        },
      ],
    },
    explain: {
      id: 'explain',
      speaker: 'Greywater Postmaster',
      text: 'The roads are being cut on purpose. I am sure of it now.',
      choices: [
        {
          label: 'I will find out why.',
          set: ['greybridge_reveal'],
          next: END_DIALOGUE,
        },
      ],
    },
    'already-know': {
      id: 'already-know',
      speaker: 'Greywater Postmaster',
      text: 'Then you understand why every delivery matters.',
      choices: [{ label: 'Goodbye.', next: END_DIALOGUE }],
    },
  },
};

describe('dialogue: story flags', () => {
  it('starts empty', () => {
    const flags = emptyFlags();
    expect(hasFlag(flags, 'greybridge_reveal')).toBe(false);
  });

  it('round trips through a plain array', () => {
    const flags = flagsFromArray(['greybridge_reveal', 'saltreach_method']);
    expect(hasFlag(flags, 'greybridge_reveal')).toBe(true);
    expect(hasFlag(flags, 'fenmarch_cost')).toBe(false);
    expect([...flagsToArray(flags)].sort()).toEqual(['greybridge_reveal', 'saltreach_method']);
  });

  it('setFlags adds ids without mutating the input', () => {
    const before = flagsFromArray(['greybridge_reveal']);
    const snapshotBefore = [...flagsToArray(before)].sort();

    const after = setFlags(before, ['saltreach_method']);

    // Input is untouched.
    expect([...flagsToArray(before)].sort()).toEqual(snapshotBefore);
    expect(hasFlag(before, 'saltreach_method')).toBe(false);

    // Output has both flags.
    expect(hasFlag(after, 'greybridge_reveal')).toBe(true);
    expect(hasFlag(after, 'saltreach_method')).toBe(true);
  });

  it('setFlags with an empty list returns the same flags unchanged', () => {
    const flags = flagsFromArray(['blockade_broken']);
    expect(setFlags(flags, [])).toBe(flags);
  });

  it('setFlags is idempotent for an already-set flag', () => {
    const flags = flagsFromArray(['fenmarch_cost']);
    const after = setFlags(flags, ['fenmarch_cost']);
    expect(flagsToArray(after)).toEqual(['fenmarch_cost']);
  });
});

describe('dialogue: flag conditions', () => {
  it('an undefined condition always passes', () => {
    expect(conditionMet(emptyFlags(), undefined)).toBe(true);
  });

  it('allOf requires every listed flag to be set', () => {
    const condition = { allOf: ['greybridge_reveal', 'saltreach_method'] };
    expect(conditionMet(emptyFlags(), condition)).toBe(false);
    expect(conditionMet(flagsFromArray(['greybridge_reveal']), condition)).toBe(false);
    expect(
      conditionMet(flagsFromArray(['greybridge_reveal', 'saltreach_method']), condition),
    ).toBe(true);
  });

  it('noneOf requires every listed flag to be unset', () => {
    const condition = { noneOf: ['blockade_broken'] };
    expect(conditionMet(emptyFlags(), condition)).toBe(true);
    expect(conditionMet(flagsFromArray(['blockade_broken']), condition)).toBe(false);
  });

  it('combines allOf and noneOf', () => {
    const condition = { allOf: ['greybridge_reveal'], noneOf: ['blockade_broken'] };
    expect(conditionMet(flagsFromArray(['greybridge_reveal']), condition)).toBe(true);
    expect(
      conditionMet(flagsFromArray(['greybridge_reveal', 'blockade_broken']), condition),
    ).toBe(false);
  });
});

describe('dialogue: node lookup and choice gating', () => {
  it('finds the start node', () => {
    const node = startDialogue(POSTMASTER_DIALOGUE);
    expect(node?.id).toBe('greet');
    expect(node?.speaker).toBe('Greywater Postmaster');
  });

  it('returns undefined for a missing node id', () => {
    expect(getNode(POSTMASTER_DIALOGUE, 'nowhere')).toBeUndefined();
  });

  it('nodeText picks the first matching variant, else the base text', () => {
    const node: DialogueNode = {
      id: 'greet',
      speaker: 'Postmaster',
      text: 'base line',
      textVariants: [
        { requires: { allOf: ['a', 'b'] }, text: 'both a and b' },
        { requires: { allOf: ['a'] }, text: 'just a' },
      ],
      choices: [],
    };
    expect(nodeText(node, emptyFlags())).toBe('base line');
    expect(nodeText(node, flagsFromArray(['a']))).toBe('just a');
    // First matching variant wins even though the second also matches.
    expect(nodeText(node, flagsFromArray(['a', 'b']))).toBe('both a and b');
  });

  it('nodeText returns base text when a node has no variants', () => {
    const node = startDialogue(POSTMASTER_DIALOGUE)!;
    expect(nodeText(node, emptyFlags())).toBe(node.text);
  });

  it('hides gated choices until the required flag is set', () => {
    const node = startDialogue(POSTMASTER_DIALOGUE)!;

    const withoutFlag = availableChoices(node, emptyFlags());
    expect(withoutFlag.map((choice) => choice.label)).toEqual(['What do you mean?']);

    const withFlag = availableChoices(node, flagsFromArray(['greybridge_reveal']));
    expect(withFlag.map((choice) => choice.label)).toEqual([
      'What do you mean?',
      'I already know about the blockade.',
    ]);
  });

  it('preserves original choice order', () => {
    const node = startDialogue(POSTMASTER_DIALOGUE)!;
    const flags = flagsFromArray(['greybridge_reveal']);
    const choices = availableChoices(node, flags);
    expect(choices[0]?.label).toBe('What do you mean?');
    expect(choices[1]?.label).toBe('I already know about the blockade.');
  });
});

describe('dialogue: choosing an option', () => {
  it('follows next to another node without changing flags', () => {
    const node = startDialogue(POSTMASTER_DIALOGUE)!;
    const [explainChoice] = availableChoices(node, emptyFlags());

    const result = chooseOption(emptyFlags(), explainChoice!);

    expect(result.next).toBe('explain');
    expect(hasFlag(result.flags, 'greybridge_reveal')).toBe(false);
  });

  it('applies set flags immutably when a choice sets one', () => {
    const explainNode = getNode(POSTMASTER_DIALOGUE, 'explain')!;
    const [revealChoice] = availableChoices(explainNode, emptyFlags());
    const before = emptyFlags();

    const result = chooseOption(before, revealChoice!);

    // Original flags untouched.
    expect(hasFlag(before, 'greybridge_reveal')).toBe(false);
    // New flags carry the reveal.
    expect(hasFlag(result.flags, 'greybridge_reveal')).toBe(true);
    expect(result.next).toBe(END_DIALOGUE);
  });

  it('reaches the terminal end signal', () => {
    const explainNode = getNode(POSTMASTER_DIALOGUE, 'explain')!;
    const [revealChoice] = availableChoices(explainNode, emptyFlags());
    const result = chooseOption(emptyFlags(), revealChoice!);
    expect(result.next).toBe(END_DIALOGUE);
  });

  it('runs a full conversation from start to end', () => {
    let flags: StoryFlags = emptyFlags();
    let node = startDialogue(POSTMASTER_DIALOGUE);
    expect(node).toBeDefined();

    // Pick "What do you mean?"
    let choices = availableChoices(node!, flags);
    let result = chooseOption(flags, choices[0]!);
    flags = result.flags;
    expect(result.next).not.toBe(END_DIALOGUE);
    node = getNode(POSTMASTER_DIALOGUE, result.next as string);
    expect(node?.id).toBe('explain');

    // Pick "I will find out why."
    choices = availableChoices(node!, flags);
    result = chooseOption(flags, choices[0]!);
    flags = result.flags;

    expect(result.next).toBe(END_DIALOGUE);
    expect(hasFlag(flags, 'greybridge_reveal')).toBe(true);
  });
});

describe('dialogue: validateDialogue', () => {
  it('finds no problems on a well formed dialogue', () => {
    expect(validateDialogue(POSTMASTER_DIALOGUE)).toEqual([]);
  });

  it('catches a dangling next node id', () => {
    const broken: Dialogue = {
      start: 'greet',
      nodes: {
        greet: {
          id: 'greet',
          speaker: 'Postmaster',
          text: 'Hello.',
          choices: [{ label: 'Go on', next: 'missing-node' }],
        },
      },
    };

    const problems = validateDialogue(broken);
    expect(problems.length).toBe(1);
    expect(problems[0]?.nodeId).toBe('greet');
    expect(problems[0]?.message).toContain('missing-node');
  });

  it('catches a dangling start node id', () => {
    const broken: Dialogue = {
      start: 'nowhere',
      nodes: {
        greet: {
          id: 'greet',
          speaker: 'Postmaster',
          text: 'Hello.',
          choices: [],
        },
      },
    };

    const problems = validateDialogue(broken);
    expect(problems.some((problem) => problem.nodeId === 'nowhere')).toBe(true);
  });
});
