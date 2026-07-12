// Saltreach Region tile data.
//
// A coastal salt-marsh borderland at the western edge of the known world.
// Water runs in a single channel down column 11, crossed by a north bridge
// (row 5), the main bridge on the west-east road (row 10), and a locked ford
// shortcut (row 15). A north-south road on column 5 links the main route to
// both the north bridge and the ford. Twin peaks guard the north-west and a
// mountain range closes the south-west corner.
//
// The region is larger than the Greybridge hub and its settlements sit off the
// road, reached across the northern forest belt or the southern marsh. That is
// deliberate (issue #151): a route is only a real travel sink when it crosses
// rough ground, so the later maps push deliveries off the road rather than just
// adding road length. See docs/design/07_roads_gate_the_wagon.md.
//
// Legend:
//   . plains    f forest   # road
//   b bridge    ~ water    ^ mountain    h hills    m marsh
//   x ford    t tidal-flat (wagon-gated)
//
// Grid is 30 wide by 20 tall. createTileMap validates row lengths and symbols
// at load time.
//
// A salt lagoon seals the Saltmere pocket in the south-east: a water wall down
// column 25 (rows 11-19) and across row 11 (cols 25-29), with one dry gap at
// the bottom (row 19). A single tidal-flat tile at (25, 12) is the short way
// across, opened by the Salt Runners upgrade or Off-road rank 3; without it
// Saltmere is reached the long marsh way down to the gap and back up the pocket.
//
// Settlements:
//   tidewatch      (4,  10)  home town, on the main west-east road
//   reedford       (22, 2)   reed-cutter settlement in the north forest belt
//   saltkeep       (22, 17)  fortified salt store deep in the southern marsh
//   cormorant-rock (28, 1)   cliff-top perch at the far north-east corner
//   saltmere       (28, 12)  drowned hamlet behind the lagoon, south-east pocket
//
// Gateway (0, 10) leads west to Greybridge. Row 10 road runs directly east to
// Tidewatch. Column 5 road runs north and south to the north bridge and ford.
// Spawn  (1, 10) is one step east of the gateway on the road.

import type { Settlement } from './settlements-greybridge';
import type { Contract } from '../systems/contract-system';
import { reconnectedFlag } from '../systems/world-state';
import { FLAG_SALTREACH_METHOD } from './dialogue-content';

// ---------------------------------------------------------------------------
// Map rows
// ---------------------------------------------------------------------------

export const SALTREACH_ROWS: readonly string[] = [
  // rows 0-3: NW peaks, water channel (col 11), northern forest belt (cols 12+)
  '^^^^.......~ffffffffffffffffff',
  '^^^^.......~ffffffffffffffffff',
  '^^^^.......~ffffffffffffffffff',
  '...........~ffffffffffffffffff',
  // row 4: north-road spur east from the north bridge toward reedford
  '...........~........#.........',
  // row 5: north bridge (col 11); west approach on col 5, spur east
  '.....######b#########.........',
  // rows 6-9: west hills off the road; open plains east of the channel
  '.....#.....~..................',
  '.hhh.#.....~..................',
  '.hhh.#.....~..................',
  '.hhh.#.....~..................',
  // row 10: main west-east road; gateway(0), spawn(1), tidewatch(4); bridge(11)
  '###################...........',
  // rows 11-14: west hills; a south spur (col 18) drops toward the marsh; the
  // salt lagoon seals the Saltmere pocket - west wall on col 25, north wall on
  // row 11 (cols 25-29), tidal-flat crossing at (25,12) beside Saltmere
  '.....#.....~......#......~~~~~',
  '.....#.hhh.~......#.mmmmmtmmmm',
  '.....#.hhh.~......#.mmmmm~mmmm',
  '.....#.....~......#.mmmmm~mmmm',
  // row 15: ford shortcut (col 11, locked); west approach on col 5; the
  // southern marsh belt begins east of the ford
  '.....######x####mmmmmmmmm~mmmm',
  // row 16: southern marsh; the lagoon wall continues down col 25
  '...........~mmmmmmmmmmmmm~mmmm',
  // rows 17-19: SW mountain range; southern marsh; the one dry gap into the
  // pocket is at the bottom of the lagoon (row 19, col 25)
  '^^^^^......~mmmmmmmmmmmmm~mmmm',
  '^^^^^......~mmmmmmmmmmmmm~mmmm',
  '^^^^^......~mmmmmmmmmmmmmmmmmm',
];

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

export const SALTREACH_LEGEND: Readonly<Record<string, string>> = {
  '.': 'plains',
  f: 'forest',
  '#': 'road',
  b: 'bridge',
  '~': 'water',
  '^': 'mountain',
  h: 'hills',
  m: 'marsh',
  x: 'ford-saltreach',
  t: 'tidal-flat',
};

// ---------------------------------------------------------------------------
// Settlements  (ids must not clash with Greybridge ids)
// ---------------------------------------------------------------------------

export const SALTREACH_SETTLEMENTS: Readonly<Record<string, Settlement>> = {
  tidewatch: {
    id: 'tidewatch',
    name: 'Tidewatch',
    tile: { x: 4, y: 10 },
    note: 'A salt-stained waystation where the road turns uncertain and the tides remember everything.',
  },
  reedford: {
    id: 'reedford',
    name: 'Reedford',
    tile: { x: 22, y: 2 },
    note: 'A small settlement of reed-cutters and net-menders who trust nobody who arrives dry.',
  },
  saltkeep: {
    id: 'saltkeep',
    name: 'Saltkeep',
    tile: { x: 22, y: 17 },
    note: 'A fortified salt store ringed by marsh fog. The garrison is smaller than the walls suggest.',
  },
  'cormorant-rock': {
    id: 'cormorant-rock',
    name: 'Cormorant Rock',
    tile: { x: 28, y: 1 },
    note: 'A cliff-top perch reached by one narrow road. The birds here carry news faster than any courier.',
  },
  saltmere: {
    id: 'saltmere',
    name: 'Saltmere',
    tile: { x: 28, y: 12 },
    note: 'A drowned hamlet in the south-east corner, ringed by a salt lagoon that took the causeway and never gave it back. Dry-shod couriers come the long way round; the bold wade the flats.',
  },
};

// ---------------------------------------------------------------------------
// Contracts  (ids must not clash with Greybridge ids)
// ---------------------------------------------------------------------------

export const SALTREACH_CONTRACTS: readonly Contract[] = [
  {
    id: 'saltreach-tide-to-reed',
    title: 'Parcels for the Reed-Cutters',
    cargo: 'wrapped parcels',
    pickupId: 'tidewatch',
    destinationId: 'reedford',
    reward: 62,
    reputation: 2,
    minReputation: 0,
    note: 'The harbormaster presses a bundle of wax-sealed parcels on you. What is in them is not your concern, and the reed-cutters will not ask.',
    cargoType: 'goods',
  },
  {
    id: 'saltreach-tide-to-keep',
    title: 'Salt Records for the Keep',
    cargo: 'ledger of salt weights',
    pickupId: 'tidewatch',
    destinationId: 'saltkeep',
    reward: 78,
    reputation: 3,
    minReputation: 3,
    note: 'The garrison has not received its monthly accounts. No one at Tidewatch will say why the last courier did not return.',
    cargoType: 'goods',
  },
  {
    id: 'saltreach-tide-to-cormorant',
    title: 'A Letter to Cormorant Rock',
    cargo: 'unmarked letter',
    pickupId: 'tidewatch',
    destinationId: 'cormorant-rock',
    reward: 95,
    reputation: 3,
    minReputation: 6,
    note: 'The letter has no seal, no name, and no return address. The person who gave it to you was already gone before you could ask a single question.',
    cargoType: 'secrets',
  },
  // Premium standing contract to Saltmere, the lagoon-ringed corner. Deliverable
  // the long dry way round, but the tidal-flat crossing (Salt Runners, or
  // Off-road rank 3) is the short way in: the gate opens a better route, never
  // the only one. Counts toward region clearance like the other standing routes.
  {
    id: 'saltreach-cipher-to-saltmere',
    title: 'A Cipher for Saltmere',
    cargo: 'a salt-stained cipher',
    pickupId: 'tidewatch',
    destinationId: 'saltmere',
    reward: 118,
    reputation: 4,
    minReputation: 6,
    note: 'Saltmere drowned quietly and no one sent word. Someone wants this carried to the hamlet behind the lagoon, and does not care whether you wade the flats or take the long road. Pays like it matters.',
    cargoType: 'secrets',
  },
  // Arc-gated: appears once the harbormaster's reveal is known (saltreach_method),
  // when the coast understands how its roads were cut. The courier starts
  // carrying the hidden network's word past the birds (ADR 0004, M5.4).
  {
    id: 'saltreach-run-the-birds',
    title: 'Outrun the Birds',
    cargo: 'a wax-sealed cipher',
    pickupId: 'tidewatch',
    destinationId: 'reedford',
    reward: 92,
    reputation: 3,
    minReputation: 0,
    note: 'Now you know why the roads were left to rot. Carry this to Reedford by wheel, ahead of whatever Cormorant Rock sends by wing. Every letter that beats a bird is a road they do not own.',
    cargoType: 'secrets',
    requires: { allOf: [FLAG_SALTREACH_METHOD] },
    arc: true,
  },
  // Second-wave coast work, opening as the salt road revives (M5.4, Session 5).
  {
    id: 'saltreach-reed-relay',
    title: 'The Reed-Cutters Repay',
    cargo: 'baled reed',
    pickupId: 'reedford',
    destinationId: 'saltkeep',
    reward: 66,
    reputation: 2,
    minReputation: 0,
    note: 'Reedford is answering again, and it owes the Keep a winter of thatch. Haul the bales up the coast road while the tide is out.',
    cargoType: 'goods',
    requires: { allOf: [reconnectedFlag('reedford')] },
  },
  {
    id: 'saltreach-keep-relay',
    title: "The Keep's Reply",
    cargo: 'a sealed dispatch',
    pickupId: 'saltkeep',
    destinationId: 'cormorant-rock',
    reward: 72,
    reputation: 3,
    minReputation: 0,
    note: 'With the Keep back on the map, the garrison has orders to send on to the watch at Cormorant Rock. Carry them the honest way, by road, and let the birds wonder.',
    cargoType: 'letters',
    requires: { allOf: [reconnectedFlag('saltkeep')] },
  },
];

// ---------------------------------------------------------------------------
// Spawn and gateway
// ---------------------------------------------------------------------------

/** Starting position for the player courier in the Saltreach region. */
export const SALTREACH_SPAWN: { readonly x: number; readonly y: number } = { x: 1, y: 10 };

/**
 * Gateway tile on the west edge (x === 0) that connects back to the
 * Greybridge region. The main road leads directly east from here to Tidewatch.
 */
export const SALTREACH_GATEWAY: { readonly x: number; readonly y: number } = { x: 0, y: 10 };
