// Authored road-encounter content, kept separate from the pure encounter engine
// (src/systems/encounter-system.ts) just as dialogue content is kept out of the
// dialogue engine.
//
// Tone follows the settlement and dialogue notes: terse, place-driven, a little
// ominous, and threaded to the Blockade (see docs/design/04_storyline.md). Each
// encounter is non-combat (ADR 0004 section 6): the tension is a choice about
// coins, standing, or a route, never a fight.
//
// Trigger tiles are chosen on the natural route out of each region's spawn and
// away from any settlement. `tests/unit/encounter-invariants.test.ts` asserts
// every trigger tile is passable and not on a settlement, so a map re-author
// that moves the road under an encounter fails CI loudly rather than silently
// stranding it.

import { END_DIALOGUE, type Dialogue } from '../systems/dialogue';
import type { RoadEncounter } from '../systems/encounter-system';

// Resolution flags. Each encounter is one-shot: once any of its flags is set the
// encounter is spent (see isEncounterResolved). These are ordinary persisted
// story flags, so resolution survives a save with no new save field.
export const FLAG_STRANDED_HELPED = 'enc_stranded_helped';
export const FLAG_STRANDED_PASSED = 'enc_stranded_passed';
export const FLAG_TOLL_PAID = 'enc_toll_paid';
export const FLAG_TOLL_REFUSED = 'enc_toll_refused';
export const FLAG_WASHOUT_TIPPED = 'enc_washout_tipped';
export const FLAG_WASHOUT_THANKED = 'enc_washout_thanked';

// Greybridge: a courier broken down on the main road east of Greywater. Helping
// costs nothing but a moment and earns goodwill and a first rumour of the birds;
// passing by is free and silent. Sits on the row-8 road at (7,8).
const GREYBRIDGE_STRANDED: Dialogue = {
  start: 'scene',
  nodes: {
    scene: {
      id: 'scene',
      speaker: 'Stranded Courier',
      text: 'Hold up, friend. Cracked an axle on a stone that has no business on a road this well kept. You would not have a spare pin and a spare minute?',
      choices: [
        { label: 'Lend a hand with the wheel.', set: [FLAG_STRANDED_HELPED], next: 'helped' },
        { label: 'You are on a schedule. Drive on.', set: [FLAG_STRANDED_PASSED], next: END_DIALOGUE },
      ],
    },
    helped: {
      id: 'helped',
      speaker: 'Stranded Courier',
      text: 'Bless your wheels. Here, take this for the trouble. And a word: watch the sky on the coast road. There are birds out there carrying more than birds should, and the folk who own them do not like witnesses. Roads are the only honest way left to send a thing.',
      choices: [{ label: 'I will remember it.', next: END_DIALOGUE }],
    },
  },
};

// Saltreach: a rope across the coast road north of Tidewatch and a toll-keeper
// who is more desperate than dangerous. Paying keeps the peace and earns a
// little standing; refusing bulls through free of charge but earns nothing.
// Sits on the column-5 road at (5,3).
const SALTREACH_TOLL: Dialogue = {
  start: 'scene',
  nodes: {
    scene: {
      id: 'scene',
      speaker: 'Toll-Keeper',
      text: 'Rope is up, courier. Coast road costs now, since the letters stopped and the coin with them. Fifteen sees you through, and no questions about the cart.',
      choices: [
        { label: 'Pay the toll. (15 coins)', set: [FLAG_TOLL_PAID], next: 'paid' },
        { label: 'Refuse and drive through.', set: [FLAG_TOLL_REFUSED], next: 'refused' },
      ],
    },
    paid: {
      id: 'paid',
      speaker: 'Toll-Keeper',
      text: 'Fair is fair. Rope is down. Word travels that you pay honest, and out here that buys you more than the road. Mind the bridge; it is not the toll you should fear on it.',
      choices: [{ label: 'On my way.', next: END_DIALOGUE }],
    },
    refused: {
      id: 'refused',
      speaker: 'Toll-Keeper',
      text: 'Then go, and quick. I will not stop a moving wagon. But I will remember the paint, and so will the ones who pay me. There are no free roads left out here, courier. Only ones nobody has charged for yet.',
      choices: [{ label: 'Drive on.', next: END_DIALOGUE }],
    },
  },
};

// Fenmarch: a warden's boy at the flooded causeway west of the bridge. A coin
// buys the news of which crossing still holds and a scrap of goodwill; a thanks
// costs nothing. Sits on the row-5 causeway at (7,5).
const FENMARCH_WASHOUT: Dialogue = {
  start: 'scene',
  nodes: {
    scene: {
      id: 'scene',
      speaker: "Warden's Boy",
      text: 'Wouldna take the low crossing, ser. Water came up in the night and the causeway is gone under. The warden sent me to turn wheels back before they drown. The bridge still holds, if you know the way.',
      choices: [
        { label: 'A coin for the safe way. (2 coins)', set: [FLAG_WASHOUT_TIPPED], next: 'tipped' },
        { label: 'Thank him and find the bridge yourself.', set: [FLAG_WASHOUT_THANKED], next: END_DIALOGUE },
      ],
    },
    tipped: {
      id: 'tipped',
      speaker: "Warden's Boy",
      text: 'Kind of ye. Keep to the bridge on the main road and dinna trust the ford till the warden says. The fen takes the forgotten roads first, my da says. Yours is not forgotten while ye drive it.',
      choices: [{ label: 'Tell the warden his boy did well.', next: END_DIALOGUE }],
    },
  },
};

/** Every authored road encounter, in fire-check order within a region. */
export const ENCOUNTERS: readonly RoadEncounter[] = [
  {
    id: 'greybridge-stranded',
    title: 'Stranded Courier',
    regionId: 'greybridge',
    tile: { x: 7, y: 8 },
    dialogue: GREYBRIDGE_STRANDED,
    outcomes: {
      [FLAG_STRANDED_HELPED]: { coins: 6, reputationId: 'greywater', reputation: 2 },
      [FLAG_STRANDED_PASSED]: {},
    },
  },
  {
    id: 'saltreach-toll',
    title: 'The Coast Road Toll',
    regionId: 'saltreach',
    tile: { x: 5, y: 3 },
    dialogue: SALTREACH_TOLL,
    outcomes: {
      [FLAG_TOLL_PAID]: { coins: -15, reputationId: 'tidewatch', reputation: 1 },
      [FLAG_TOLL_REFUSED]: {},
    },
  },
  {
    id: 'fenmarch-washout',
    title: 'The Washed-Out Causeway',
    regionId: 'fenmarch',
    tile: { x: 7, y: 5 },
    dialogue: FENMARCH_WASHOUT,
    outcomes: {
      [FLAG_WASHOUT_TIPPED]: { coins: -2, reputationId: 'mossgate', reputation: 1 },
      [FLAG_WASHOUT_THANKED]: {},
    },
  },
];
