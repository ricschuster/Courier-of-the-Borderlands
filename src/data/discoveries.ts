// Authored wayside-discovery content, kept separate from the pure discovery
// engine (src/systems/discovery.ts) just as encounter and dialogue content are.
//
// Each discovery is a scrap of lore hidden off the beaten route and found by
// revealing its tile, so a courier who invests in reveal (Wayfinder / far
// lantern) is paid in story, not just sight (roads-gate slice 5b, issue #111).
// Tone follows the settlement and encounter notes: terse, place-driven, a little
// ominous, and threaded to the Hidden Road (docs/design/04_storyline.md,
// 07_roads_gate_the_wagon.md). The cipherNote is the deeper line only a courier
// with the Cipher skill can read, tying reveal and Cipher into one explorer
// payoff (#183).
//
// Placement rules (guarded by tests/unit/discovery-invariants.test.ts, mirroring
// the encounter invariants): every tile must be base-passable, off any
// settlement, and unique, so a map re-author that moves terrain under a
// discovery fails CI loudly rather than stranding the lore off the map. Tiles
// sit well off the direct delivery routes, in a quiet corner of each region, so
// the base wagon rarely reveals them and reaching them reads as exploration.

import type { Discovery } from '../systems/discovery';

export const DISCOVERIES: readonly Discovery[] = [
  // Greybridge: deep in the untracked north-east forest, off every road.
  {
    id: 'greybridge-waybird-cairn',
    regionId: 'greybridge',
    tile: { x: 25, y: 1 },
    title: 'The Waybird Cairn',
    note: 'A cairn of grey stones stands where no path leads, each stone scratched with the mark of a bird in flight. The moss has been cleared and the marks freshly chalked. Someone tends it, and not long ago.',
    cipherNote:
      'The chalk is a courier hand you have started to know. It reads: the roads remember their keepers, and the keepers are coming back. A date is set beneath it, and it is close now.',
  },
  // Saltreach: in the salt-drowned north wood, off the coast road.
  {
    id: 'saltreach-drowned-waystone',
    regionId: 'saltreach',
    tile: { x: 16, y: 1 },
    title: 'The Drowned Waystone',
    note: 'A boundary stone leans in the wet wood, half its face eaten away by salt. Below where the water sits, someone has cut new letters into the clean stone, too sharp to be old work.',
    cipherNote:
      'The fresh cuts are a relay mark: this was a station on a road the maps deny, and the mark says it is being opened again. The arrow of it points east, toward the blockade.',
  },
  // Fenmarch: an old milestone in the western hills, off the fen road.
  {
    id: 'fenmarch-hollow-milestone',
    regionId: 'fenmarch',
    tile: { x: 2, y: 8 },
    title: 'The Hollow Milestone',
    note: 'An old milestone stands in the hills with its number chiselled away. In the hollow where the figure had been, a folded scrap of oiled cloth has been tucked, kept dry despite the fen.',
    cipherNote:
      'The cloth holds a tally in cipher: stops reconnected, a count that is rising. Yours is the hand adding to it, whether you meant to carry the Hidden Road or not.',
  },
];
