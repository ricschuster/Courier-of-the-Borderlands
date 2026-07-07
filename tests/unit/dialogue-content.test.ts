import { describe, it, expect } from 'vitest';
import {
  SETTLEMENT_DIALOGUES,
  dialogueForSettlement,
  FLAG_MET_POSTMASTER,
  FLAG_GREYBRIDGE_REVEAL,
  FLAG_HOME_RECONNECTED,
} from '../../src/data/dialogue-content';
import {
  validateDialogue,
  startDialogue,
  availableChoices,
  chooseOption,
  emptyFlags,
  setFlags,
  hasFlag,
  END_DIALOGUE,
} from '../../src/systems/dialogue';

describe('dialogue-content', () => {
  it('every authored dialogue is structurally valid', () => {
    for (const [id, dialogue] of Object.entries(SETTLEMENT_DIALOGUES)) {
      expect(validateDialogue(dialogue), `dialogue for ${id}`).toEqual([]);
    }
  });

  it('looks up the Greywater postmaster and returns undefined for a silent place', () => {
    expect(dialogueForSettlement('greywater')).toBeDefined();
    expect(dialogueForSettlement('northcairn')).toBeUndefined();
  });

  it('asking about the roads sets the met-postmaster flag', () => {
    const dialogue = dialogueForSettlement('greywater');
    expect(dialogue).toBeDefined();
    if (dialogue === undefined) {
      return;
    }
    const start = startDialogue(dialogue);
    expect(start?.id).toBe('greeting');
    if (start === undefined) {
      return;
    }
    const choices = availableChoices(start, emptyFlags());
    const roadsChoice = choices.find((c) => c.next === 'roads');
    expect(roadsChoice).toBeDefined();
    if (roadsChoice === undefined) {
      return;
    }
    const result = chooseOption(emptyFlags(), roadsChoice);
    expect(hasFlag(result.flags, FLAG_MET_POSTMASTER)).toBe(true);
    expect(result.next).toBe('roads');
  });

  it('hides the reveal until the region is reconnected, then unlocks it once', () => {
    const dialogue = dialogueForSettlement('greywater');
    if (dialogue === undefined) {
      throw new Error('expected the postmaster dialogue');
    }
    const greeting = startDialogue(dialogue);
    if (greeting === undefined) {
      throw new Error('expected a greeting node');
    }

    // Before the region is reconnected, the reveal choice is not offered.
    const before = availableChoices(greeting, emptyFlags());
    expect(before.some((c) => c.next === 'reveal')).toBe(false);

    // With the derived home-reconnected flag, the reveal is offered and sets
    // the Act 1 reveal flag when taken.
    const reconnected = setFlags(emptyFlags(), [FLAG_HOME_RECONNECTED]);
    const withReveal = availableChoices(greeting, reconnected);
    const revealChoice = withReveal.find((c) => c.next === 'reveal');
    expect(revealChoice).toBeDefined();
    if (revealChoice === undefined) {
      return;
    }
    const afterReveal = chooseOption(reconnected, revealChoice).flags;
    expect(hasFlag(afterReveal, FLAG_GREYBRIDGE_REVEAL)).toBe(true);

    // Once revealed, the choice no longer appears even while reconnected.
    const seen = setFlags(afterReveal, [FLAG_HOME_RECONNECTED]);
    const afterChoices = availableChoices(greeting, seen);
    expect(afterChoices.some((c) => c.next === 'reveal')).toBe(false);
  });

  it('every terminal choice ends the conversation cleanly', () => {
    const dialogue = dialogueForSettlement('greywater');
    if (dialogue === undefined) {
      throw new Error('expected the postmaster dialogue');
    }
    // At least one path reaches END_DIALOGUE from the greeting.
    const greeting = startDialogue(dialogue);
    const endings = greeting?.choices.filter((c) => c.next === END_DIALOGUE) ?? [];
    expect(endings.length).toBeGreaterThan(0);
  });
});
