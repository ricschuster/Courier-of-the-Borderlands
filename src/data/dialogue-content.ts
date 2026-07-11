// Authored dialogue content, kept separate from the pure dialogue engine
// (src/systems/dialogue.ts). Story lives here; the engine stays generic.
//
// Tone follows the settlement and contract notes: terse, place-driven, a little
// ominous. The spine is the Blockade (see docs/design/04_storyline.md): the
// borderland's silence is engineered, and the courier is the thread that
// reconnects it. This first conversation is the Act 1 setup at the home town.

import { END_DIALOGUE, type Dialogue } from '../systems/dialogue';
import { skillFlag } from '../systems/skills';

// Story flags this content sets or reads. Named here so the scene and the
// content agree on ids.
//
// Persisted (written to the save, mutated only by a dialogue choice):
export const FLAG_MET_POSTMASTER = 'met_postmaster';
export const FLAG_GREYBRIDGE_REVEAL = 'greybridge_reveal';
// Spoke reveals: Saltreach shows the method (how the roads are cut), Fenmarch
// shows the cost (what isolation does to a place). Each unlocks once its region
// is reconnected. See docs/design/04_storyline.md.
export const FLAG_SALTREACH_METHOD = 'saltreach_method';
export const FLAG_FENMARCH_COST = 'fenmarch_cost';
// The arc's resolution: set at the Greywater capstone once both spoke reveals
// are known. The immediate blockade over the borderland is broken; the larger
// question of who commands it stays open. See docs/design/04_storyline.md.
export const FLAG_BLOCKADE_BROKEN = 'blockade_broken';
// Derived (never persisted): granted by the Cipher social skill while owned.
// Gates dialogue lines that only a courier who can read carried secrets sees.
export const FLAG_CIPHER = skillFlag('cipher');
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
      // On a return visit, once the courier has reconnected the home region, the
      // postmaster should not repeat the cold opening line (Session 3 playtest).
      textVariants: [
        {
          // The arc is resolved: greet the courier as the one who broke the
          // blockade, so returning here after the ending is not an empty room.
          requires: { allOf: [FLAG_BLOCKADE_BROKEN] },
          text: 'The courier who broke the blockade, back at my counter. The board keeps filling and the letters keep landing, coast to fen. You gave the borderland its roads back. Whatever you need here, it is yours.',
        },
        {
          requires: { allOf: [FLAG_HOME_RECONNECTED] },
          text: 'You came back, and you brought the roads with you. Letters are landing in places that went dark a season ago. That is your doing, courier. Tell me what the roads have told you.',
        },
      ],
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
        {
          label: 'Both roads are open again. Saltreach and the fen.',
          requires: {
            allOf: [FLAG_SALTREACH_METHOD, FLAG_FENMARCH_COST],
            noneOf: [FLAG_BLOCKADE_BROKEN],
          },
          set: [FLAG_BLOCKADE_BROKEN],
          next: 'resolve',
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
        {
          label: 'I have started to read the unsigned letters.',
          requires: { allOf: [FLAG_CIPHER] },
          next: 'cipher',
        },
        { label: 'I will watch for them.', next: END_DIALOGUE },
        { label: 'Ask something else.', next: 'greeting' },
      ],
    },
    cipher: {
      id: 'cipher',
      speaker: 'Greywater Postmaster',
      text: 'Then you already know more than is safe. Whoever writes them is stitching the roads back together in the dark, one courier at a time. Keep that skill quiet. The last one who could read them went east asking questions, and the coast kept him.',
      choices: [
        { label: 'I will keep it to myself.', next: END_DIALOGUE },
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
    resolve: {
      id: 'resolve',
      speaker: 'Greywater Postmaster',
      text: 'Then it is done, the part we can do. Word runs the roads faster than their birds now, coast to fen, because a courier carried it. Whoever cut these roads has lost the borderland. They have not lost everything, and they will not forget your wheels. But tonight the lamps are lit from here to Hollowfen. Rest. The next road can wait for morning.',
      choices: [
        { label: 'And then?', next: END_DIALOGUE },
        { label: 'Ask something else.', next: 'greeting' },
      ],
    },
  },
};

// Saltreach, the method. The Tidewatch harbormaster knows how the roads are
// being cut: couriers who ask too much do not return, and a faster network of
// birds is quietly replacing the road. The reveal unlocks once Saltreach is
// reconnected.
const TIDEWATCH_HARBORMASTER: Dialogue = {
  start: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Tidewatch Harbormaster',
      text: 'You came by the road? Dry, and still breathing. That is rarer than it used to be. Say your business quick.',
      // Once the coast is reconnected and the method is known, the harbormaster
      // should greet the courier as the one who did it, not as a stranger off
      // the road (Session 5 playtest, mirroring the postmaster fix).
      textVariants: [
        {
          requires: { allOf: [FLAG_SALTREACH_METHOD] },
          text: 'The road-courier, back on my quay. Reedford to Cormorant Rock, letters landing where the birds used to rule. The coast talks to itself again because of you. Say your business.',
        },
      ],
      choices: [
        { label: 'What happened to the last courier?', next: 'courier' },
        { label: 'Any work on the board?', next: 'work' },
        {
          label: 'The coast is answering again.',
          requires: { allOf: [FLAG_HOME_RECONNECTED], noneOf: [FLAG_SALTREACH_METHOD] },
          set: [FLAG_SALTREACH_METHOD],
          next: 'method',
        },
        { label: 'Nothing. Good tides.', next: END_DIALOGUE },
      ],
    },
    courier: {
      id: 'courier',
      speaker: 'Tidewatch Harbormaster',
      text: 'Wrenn. Ran this coast for years, then started asking who was paying the birds. Went out to Saltkeep one morning and the road gave back an empty cart. Nobody here will say the name twice.',
      choices: [
        { label: 'The birds?', next: 'method' },
        { label: 'I will be careful.', next: END_DIALOGUE },
        { label: 'Ask something else.', next: 'greeting' },
      ],
    },
    work: {
      id: 'work',
      speaker: 'Tidewatch Harbormaster',
      text: 'The board is by the quay. Carry honest cargo and the reed-cutters might even nod at you. Twice, if you are lucky.',
      choices: [
        { label: 'Ask something else.', next: 'greeting' },
        { label: 'On my way.', next: END_DIALOGUE },
      ],
    },
    method: {
      id: 'method',
      speaker: 'Tidewatch Harbormaster',
      text: 'Then hear it plain. The roads did not fail on their own. Someone lets them rot, and sells the coast its news by bird instead, out of Cormorant Rock. A settlement that cannot send a letter has to buy one. That is the whole trick, courier, and it does not stop at Saltreach.',
      choices: [
        { label: 'Who profits from that?', next: 'birds' },
        { label: 'Then I will keep the roads alive.', next: END_DIALOGUE },
      ],
    },
    birds: {
      id: 'birds',
      speaker: 'Tidewatch Harbormaster',
      text: 'Whoever owns the birds owns the truth out here. I do not say their name. But you carry letters with no seal on them, do you not? Someone is building a road they cannot reach. Carry those well.',
      choices: [
        { label: 'I will.', next: END_DIALOGUE },
        { label: 'Ask something else.', next: 'greeting' },
      ],
    },
  },
};

// Fenmarch, the cost. The Mossgate warden has watched what happens to a place
// once the road forgets it. The reveal unlocks once Fenmarch is reconnected.
const MOSSGATE_WARDEN: Dialogue = {
  start: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Mossgate Warden',
      text: 'Keep your lamp lit past the crossroads. The mist here does not wait for evening, and neither does what moves in it. You are the first wheel I have heard on this road in a long while.',
      // After the fen is reconnected and its cost is understood, the warden knows
      // the courier's wheels and speaks to what they changed (Session 5 playtest).
      textVariants: [
        {
          requires: { allOf: [FLAG_FENMARCH_COST] },
          text: 'Your wheels again. I know the sound now. Duskmere to Hollowfen, lamps lit past the crossroads because a cart kept coming through the mist. That is no small thing out here. What do you need?',
        },
      ],
      choices: [
        { label: 'What moves in the mist?', next: 'dark' },
        { label: 'Any work on the board?', next: 'work' },
        {
          label: 'The fen is answering again.',
          requires: { allOf: [FLAG_HOME_RECONNECTED], noneOf: [FLAG_FENMARCH_COST] },
          set: [FLAG_FENMARCH_COST],
          next: 'cost',
        },
        { label: 'I will keep moving.', next: END_DIALOGUE },
      ],
    },
    dark: {
      id: 'dark',
      speaker: 'Mossgate Warden',
      text: 'Nobody agrees. But mark where it is worst: Thornwick, that barred its gate; Duskmere, where the water goes dark early now. The places the road forgot first. Cut a village off long enough and something else fills the quiet.',
      choices: [
        { label: 'Can it be undone?', next: 'cost' },
        { label: 'I have heard enough.', next: END_DIALOGUE },
        { label: 'Ask something else.', next: 'greeting' },
      ],
    },
    work: {
      id: 'work',
      speaker: 'Mossgate Warden',
      text: 'The board is under the old stone. Hollowfen has been waiting on a letter longer than you have been alive. If you can reach it, reach it.',
      choices: [
        { label: 'Ask something else.', next: 'greeting' },
        { label: 'On my way.', next: END_DIALOGUE },
      ],
    },
    cost: {
      id: 'cost',
      speaker: 'Mossgate Warden',
      text: 'It can. I have seen it, these past days: a cart arrives, a lamp goes back up in a window, and the dark holds off one more night. That is what your deliveries are, courier. Not trade. A place remembering it is not alone. Whoever cut these roads wanted the opposite. Do not let them have it.',
      choices: [
        { label: 'They will not.', next: END_DIALOGUE },
        { label: 'Ask something else.', next: 'greeting' },
      ],
    },
  },
};

/** Authored conversations keyed by the settlement id whose NPC speaks them. */
export const SETTLEMENT_DIALOGUES: Readonly<Record<string, Dialogue>> = {
  greywater: GREYWATER_POSTMASTER,
  tidewatch: TIDEWATCH_HARBORMASTER,
  mossgate: MOSSGATE_WARDEN,
};

/** The conversation for a settlement, or undefined when no one there speaks yet. */
export function dialogueForSettlement(settlementId: string): Dialogue | undefined {
  return SETTLEMENT_DIALOGUES[settlementId];
}
