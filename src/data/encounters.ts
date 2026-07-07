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
export const FLAG_ROCKFALL_CLEARED = 'enc_rockfall_cleared';
export const FLAG_ROCKFALL_PICKED = 'enc_rockfall_picked';
export const FLAG_SEAFOG_GUIDED = 'enc_seafog_guided';
export const FLAG_SEAFOG_ALONE = 'enc_seafog_alone';
export const FLAG_FENGUIDE_HELPED = 'enc_fenguide_helped';
export const FLAG_FENGUIDE_PASSED = 'enc_fenguide_passed';

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

// Greybridge, side route: a rockfall on the mine road down to Ironhollow.
// Clearing it earns the miners' goodwill and keeps the road open for the next
// wagon; picking through is free but leaves the stones for someone else. A
// weather/hazard event on a spur only the Ironhollow and Mirewatch runs take.
// Sits on the mountain descent road at (5,17).
const GREYBRIDGE_ROCKFALL: Dialogue = {
  start: 'scene',
  nodes: {
    scene: {
      id: 'scene',
      speaker: 'The Road',
      text: 'The mine road is half buried. A shelf of the mountain came down in the last blow, and the stones are stacked shoulder-high across the ruts. Ironhollow is somewhere on the far side of it.',
      choices: [
        { label: 'Roll up your sleeves and clear a lane.', set: [FLAG_ROCKFALL_CLEARED], next: 'cleared' },
        { label: 'Pick the wagon through the gap and move on.', set: [FLAG_ROCKFALL_PICKED], next: END_DIALOGUE },
      ],
    },
    cleared: {
      id: 'cleared',
      speaker: 'Ironhollow Miner',
      text: 'Heard the stones shifting from the shaft. You did not have to do that, courier, and that is exactly why it will be remembered down the hollow. A cleared road is worth more to us than most of what gets carried on it.',
      choices: [{ label: 'Just keeping the road open.', next: END_DIALOGUE }],
    },
  },
};

// Saltreach, side route: sea-fog swallows the cliff road to Cormorant Rock, the
// one road only the courier's most dangerous contract takes. A birdkeeper will
// lead you along the ledge for a coin; feeling your way alone is free but blind.
// A weather-closing-a-pass event at (15,0) on the north-east cliff road.
const SALTREACH_SEAFOG: Dialogue = {
  start: 'scene',
  nodes: {
    scene: {
      id: 'scene',
      speaker: 'Birdkeeper',
      text: 'Fog is in off the water, courier, and the cliff road has no rail. One wheel wrong and it is a long quiet fall. I know every stone of this ledge by the sound of the birds. A coin, and I will walk you along it.',
      choices: [
        { label: 'Take the guide. (3 coins)', set: [FLAG_SEAFOG_GUIDED], next: 'guided' },
        { label: 'Feel your own way through the fog.', set: [FLAG_SEAFOG_ALONE], next: END_DIALOGUE },
      ],
    },
    guided: {
      id: 'guided',
      speaker: 'Birdkeeper',
      text: 'Steady now. Left wheel to the rock, always. The birds go quiet where the edge is nearest, so listen for the silence. There. Solid road under you again. Whatever you carry up to the Rock, courier, carry it and come straight back down.',
      choices: [{ label: 'My thanks.', next: END_DIALOGUE }],
    },
  },
};

// Fenmarch, side route: a fen-guide bogged to the axle in the forest corridor
// north to Duskmere. Helping earns the marsh warden's people; passing leaves
// them to the mud. A stranded-traveller event at (14,4) up the corridor.
const FENMARCH_FENGUIDE: Dialogue = {
  start: 'scene',
  nodes: {
    scene: {
      id: 'scene',
      speaker: 'Fen-Guide',
      text: 'Sunk to the axle, ser, and the light going. I know these paths blind but I cannot know them and dig at once. A shoulder on the wheel and we are both moving before the mist thickens.',
      choices: [
        { label: 'Put your shoulder to the wheel.', set: [FLAG_FENGUIDE_HELPED], next: 'helped' },
        { label: 'The mist is rising. Press on alone.', set: [FLAG_FENGUIDE_PASSED], next: END_DIALOGUE },
      ],
    },
    helped: {
      id: 'helped',
      speaker: 'Fen-Guide',
      text: 'Out, and dry-shod. Take this for the trouble. And when you go up to Duskmere, say the guide sent you; they turn away strangers on the water road, but not friends of mine. Few enough travel it now to make a friend worth the making.',
      choices: [{ label: 'I will say so.', next: END_DIALOGUE }],
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
  {
    id: 'greybridge-rockfall',
    title: 'The Rockfall on the Mine Road',
    regionId: 'greybridge',
    tile: { x: 5, y: 17 },
    dialogue: GREYBRIDGE_ROCKFALL,
    outcomes: {
      [FLAG_ROCKFALL_CLEARED]: { reputationId: 'ironhollow', reputation: 2 },
      [FLAG_ROCKFALL_PICKED]: {},
    },
  },
  {
    id: 'saltreach-seafog',
    title: 'Sea-Fog on the Cliff Road',
    regionId: 'saltreach',
    tile: { x: 15, y: 0 },
    dialogue: SALTREACH_SEAFOG,
    outcomes: {
      [FLAG_SEAFOG_GUIDED]: { coins: -3, reputationId: 'tidewatch', reputation: 1 },
      [FLAG_SEAFOG_ALONE]: {},
    },
  },
  {
    id: 'fenmarch-fenguide',
    title: 'The Bogged Fen-Guide',
    regionId: 'fenmarch',
    tile: { x: 14, y: 4 },
    dialogue: FENMARCH_FENGUIDE,
    outcomes: {
      [FLAG_FENGUIDE_HELPED]: { coins: 5, reputationId: 'mossgate', reputation: 2 },
      [FLAG_FENGUIDE_PASSED]: {},
    },
  },
];
