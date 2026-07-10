import { describe, it, expect } from 'vitest';
import {
  SETTLEMENT_DIALOGUES,
  dialogueForSettlement,
  FLAG_MET_POSTMASTER,
  FLAG_GREYBRIDGE_REVEAL,
  FLAG_HOME_RECONNECTED,
  FLAG_SALTREACH_METHOD,
  FLAG_FENMARCH_COST,
  FLAG_CIPHER,
} from '../../src/data/dialogue-content';
import {
  validateDialogue,
  startDialogue,
  availableChoices,
  chooseOption,
  emptyFlags,
  setFlags,
  hasFlag,
  getNode,
  nodeText,
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

  it('greets differently on a return visit once the region is reconnected', () => {
    const dialogue = dialogueForSettlement('greywater');
    if (dialogue === undefined) {
      throw new Error('expected the postmaster dialogue');
    }
    const greeting = startDialogue(dialogue);
    if (greeting === undefined) {
      throw new Error('expected a greeting node');
    }
    const first = nodeText(greeting, emptyFlags());
    const returning = nodeText(greeting, setFlags(emptyFlags(), [FLAG_HOME_RECONNECTED]));
    expect(returning).not.toBe(first);
    // The base opening line is only for the first meeting.
    expect(first).toContain('Back on the road');
    expect(returning).not.toContain('Back on the road');
  });

  it('greets the courier warmly at each spoke once its region is reconnected', () => {
    const cases = [
      { id: 'tidewatch', flag: FLAG_SALTREACH_METHOD, coldOpening: 'You came by the road' },
      { id: 'mossgate', flag: FLAG_FENMARCH_COST, coldOpening: 'first wheel' },
    ] as const;
    for (const { id, flag, coldOpening } of cases) {
      const dialogue = dialogueForSettlement(id);
      if (dialogue === undefined) {
        throw new Error(`expected a dialogue for ${id}`);
      }
      const greeting = startDialogue(dialogue);
      if (greeting === undefined) {
        throw new Error(`expected a greeting node for ${id}`);
      }
      const first = nodeText(greeting, emptyFlags());
      const returning = nodeText(greeting, setFlags(emptyFlags(), [flag]));
      expect(first, `${id} cold opening`).toContain(coldOpening);
      expect(returning, `${id} return greeting differs`).not.toBe(first);
      expect(returning, `${id} drops the cold opening`).not.toContain(coldOpening);
    }
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

  it('gates each spoke reveal on its region being reconnected, and sets its flag once', () => {
    const cases = [
      { id: 'tidewatch', flag: FLAG_SALTREACH_METHOD, node: 'method' },
      { id: 'mossgate', flag: FLAG_FENMARCH_COST, node: 'cost' },
    ] as const;
    for (const { id, flag, node } of cases) {
      const dialogue = dialogueForSettlement(id);
      if (dialogue === undefined) {
        throw new Error(`expected a dialogue for ${id}`);
      }
      const greeting = startDialogue(dialogue);
      if (greeting === undefined) {
        throw new Error(`expected a greeting node for ${id}`);
      }

      // Hidden until the region is reconnected.
      const before = availableChoices(greeting, emptyFlags());
      expect(before.some((c) => c.next === node), `${id} reveal hidden before reconnect`).toBe(
        false,
      );

      // Offered once reconnected, and taking it sets the spoke flag.
      const reconnected = setFlags(emptyFlags(), [FLAG_HOME_RECONNECTED]);
      const withReveal = availableChoices(greeting, reconnected);
      const revealChoice = withReveal.find((c) => c.next === node);
      expect(revealChoice, `${id} reveal offered after reconnect`).toBeDefined();
      if (revealChoice === undefined) {
        continue;
      }
      const after = chooseOption(reconnected, revealChoice).flags;
      expect(hasFlag(after, flag), `${id} sets ${flag}`).toBe(true);

      // Not offered again once the flag is set.
      const seen = setFlags(after, [FLAG_HOME_RECONNECTED]);
      expect(availableChoices(greeting, seen).some((c) => c.next === node)).toBe(false);
    }
  });

  it('shows the Cipher-only line at the postmaster only when the skill flag is present', () => {
    const dialogue = dialogueForSettlement('greywater');
    if (dialogue === undefined) {
      throw new Error('expected the postmaster dialogue');
    }
    const letters = getNode(dialogue, 'letters');
    if (letters === undefined) {
      throw new Error('expected a letters node');
    }
    // Without the Cipher skill flag, the reading-the-letters line is hidden.
    expect(availableChoices(letters, emptyFlags()).some((c) => c.next === 'cipher')).toBe(false);
    // With it, the line appears.
    const withCipher = setFlags(emptyFlags(), [FLAG_CIPHER]);
    expect(availableChoices(letters, withCipher).some((c) => c.next === 'cipher')).toBe(true);
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
