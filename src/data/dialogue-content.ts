// Authored dialogue content, kept separate from the pure dialogue engine
// (src/systems/dialogue.ts). Story lives here; the engine stays generic.
//
// Tone follows the settlement and contract notes: terse, place-driven, a little
// ominous. The spine is the Blockade (see docs/design/04_storyline.md): the
// borderland's silence is engineered, and the courier is the thread that
// reconnects it. This first conversation is the Act 1 setup at the home town.

import { END_DIALOGUE, type Dialogue } from '../systems/dialogue';

// Story flags this content sets or reads. Named here so the scene and the
// content agree on ids.
//
// Persisted (written to the save, mutated only by a dialogue choice):
export const FLAG_MET_POSTMASTER = 'met_postmaster';
export const FLAG_GREYBRIDGE_REVEAL = 'greybridge_reveal';
// Derived (never persisted): the scene computes this from world-state each time
// a dialogue opens, so a choice can gate on a real fact about the world. It is
// set when the home region's contracts are all delivered (the region is
// reconnected), which is what unlocks the postmaster's Act 1 reveal.
export const FLAG_HOME_RECONNECTED = 'home_reconnected';

// The Greywater postmaster: the voice of the courier road tradition, and the
// first quest-giver. Gives the premise, the unease, and (once the player has
// reconnected the region) the reveal that points the story outward.
const GREYWATER_POSTMASTER: Dialogue = {
  start: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Greywater Postmaster',
      text: 'Back on the road, courier? Good. Half my letters have nowhere to go these days. Places stop answering, one by one.',
      choices: [
        {
          label: 'What is happening to the roads?',
          set: [FLAG_MET_POSTMASTER],
          next: 'roads',
        },
        { label: 'Any work on the board?', next: 'work' },
        {
          label: 'The region is answering again.',
          requires: { allOf: [FLAG_HOME_RECONNECTED], noneOf: [FLAG_GREYBRIDGE_REVEAL] },
          set: [FLAG_GREYBRIDGE_REVEAL],
          next: 'reveal',
        },
        { label: 'Just passing through.', next: END_DIALOGUE },
      ],
    },
    roads: {
      id: 'roads',
      speaker: 'Greywater Postmaster',
      text: 'Nobody knows. Eastwatch went quiet first, then the mill. A road does not simply forget how to carry a letter. Someone wants these places cut off, and the couriers who go asking do not always come back.',
      choices: [
        { label: 'Who would want that?', next: 'letters' },
        { label: 'I will keep the roads open.', next: END_DIALOGUE },
        { label: 'Ask something else.', next: 'greeting' },
      ],
    },
    letters: {
      id: 'letters',
      speaker: 'Greywater Postmaster',
      text: 'If I knew, I would not be whispering it to a courier. But mark this: some folk have started routing word around my post office. Letters with no seal and no name. Someone is building a road I cannot see.',
      choices: [
        { label: 'I will watch for them.', next: END_DIALOGUE },
        { label: 'Ask something else.', next: 'greeting' },
      ],
    },
    work: {
      id: 'work',
      speaker: 'Greywater Postmaster',
      text: 'The board is by the door. Take what you can carry. Every delivery is one more place that remembers it is not alone out here.',
      choices: [
        { label: 'Ask something else.', next: 'greeting' },
        { label: 'On my way.', next: END_DIALOGUE },
      ],
    },
    reveal: {
      id: 'reveal',
      speaker: 'Greywater Postmaster',
      text: 'So they are. I felt it, the day your deliveries started landing. This was no accident, courier. Someone cut these roads on purpose, and whoever it was does not stop at Greybridge. If you want the why of it, you will have to carry it out of the region. Follow the letters.',
      choices: [
        { label: 'Then I will follow them.', next: END_DIALOGUE },
        { label: 'Ask something else.', next: 'greeting' },
      ],
    },
  },
};

/** Authored conversations keyed by the settlement id whose NPC speaks them. */
export const SETTLEMENT_DIALOGUES: Readonly<Record<string, Dialogue>> = {
  greywater: GREYWATER_POSTMASTER,
};

/** The conversation for a settlement, or undefined when no one there speaks yet. */
export function dialogueForSettlement(settlementId: string): Dialogue | undefined {
  return SETTLEMENT_DIALOGUES[settlementId];
}
