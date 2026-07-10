// Saltreach Region tile data.
//
// A coastal salt-marsh borderland at the western edge of the known world.
// Water runs in a single channel down column 7, crossed by two bridges (rows
// 2 and 8) and a locked ford shortcut (row 6). A north-south road on column 5
// links the main east-west route to both crossings. Twin peaks guard the
// north-west and a mountain range closes the south-west corner.
//
// Legend:
//   . plains    f forest   # road
//   b bridge    ~ water    ^ mountain    x ford
//
// Grid is 20 wide by 11 tall. createTileMap validates row lengths and symbols
// at load time.
//
// Settlements:
//   tidewatch      (5,  5)  home town, on the main west-east road
//   reedford       (13, 2)  reed-cutter settlement north-east of the bridge
//   saltkeep       (13, 8)  fortified salt store east of the south bridge
//   cormorant-rock (18, 0)  cliff-top perch at the far north-east corner
//
// Gateway (0, 5) leads west to Greybridge. Row 5 road runs directly east to
// Tidewatch. Column 5 road runs north and south to the bridges.
// Spawn  (1, 5) is one step east of the gateway on the road.

import type { Settlement } from './settlements-greybridge';
import type { Contract } from '../systems/contract-system';
import { reconnectedFlag } from '../systems/world-state';
import { FLAG_SALTREACH_METHOD } from './dialogue-content';

// ---------------------------------------------------------------------------
// Map rows
// ---------------------------------------------------------------------------

export const SALTREACH_ROWS: readonly string[] = [
  // row 0: mountains NW, single water column, road east to cormorant-rock
  '....^^.~..f..######.',
  // row 1: peaks continue, road south from cormorant-rock
  '....^..~..f..#......',
  // row 2: north bridge crosses water; reedford east of bridge on road
  '.....#.b..f..#......',
  // row 3: road col 5 continues; plains and forest east of water
  '.....#.~..f.........',
  // row 4: road col 5 continues; forest thickens east
  '.....#.~..f.ff......',
  // row 5: main west-east road; gateway(0), spawn(1), tidewatch(5)
  '######.~..ff........',
  // row 6: ford shortcut (locked) at col 7; road col 5 south
  '.....#.x..ff........',
  // row 7: road col 5 approaches south bridge
  '.....#.~..ff........',
  // row 8: south bridge crosses water; saltkeep east of bridge on road
  '.....#.b..ff.##.....',
  // row 9: southern mountains; road east continues toward saltkeep
  '....^^.~..f..##.....',
  // row 10: mountain range closes south-west corner; water continues
  '..^^^^.~..f.........',
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
  x: 'ford-saltreach',
};

// ---------------------------------------------------------------------------
// Settlements  (ids must not clash with Greybridge ids)
// ---------------------------------------------------------------------------

export const SALTREACH_SETTLEMENTS: Readonly<Record<string, Settlement>> = {
  tidewatch: {
    id: 'tidewatch',
    name: 'Tidewatch',
    tile: { x: 5, y: 5 },
    note: 'A salt-stained waystation where the road turns uncertain and the tides remember everything.',
  },
  reedford: {
    id: 'reedford',
    name: 'Reedford',
    tile: { x: 13, y: 2 },
    note: 'A small settlement of reed-cutters and net-menders who trust nobody who arrives dry.',
  },
  saltkeep: {
    id: 'saltkeep',
    name: 'Saltkeep',
    tile: { x: 13, y: 8 },
    note: 'A fortified salt store ringed by marsh fog. The garrison is smaller than the walls suggest.',
  },
  'cormorant-rock': {
    id: 'cormorant-rock',
    name: 'Cormorant Rock',
    tile: { x: 18, y: 0 },
    note: 'A cliff-top perch reached by one narrow road. The birds here carry news faster than any courier.',
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
export const SALTREACH_SPAWN: { readonly x: number; readonly y: number } = { x: 1, y: 5 };

/**
 * Gateway tile on the west edge (x === 0) that connects back to the
 * Greybridge region. The main road leads directly east from here to Tidewatch.
 */
export const SALTREACH_GATEWAY: { readonly x: number; readonly y: number } = { x: 0, y: 5 };
