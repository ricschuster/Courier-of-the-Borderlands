// Ashmoor Region tile data.
//
// A burnt upland east of both spokes, and the first region reached by more than
// one road: its north-west gateway leads back to Saltreach and its south-west
// gateway back to Fenmarch, closing the world into a ring instead of a hub with
// two dead ends (docs/design/10_open_world_expansion.md).
//
// The old Ember Road ran west to east across this moor before the roads were
// cut, which is why a road network survives here with almost nothing left to
// use it. A single water channel splits the map down column 16, crossed by the
// north road (bridge, row 4), the south road (bridge, row 23), and a locked
// ford shortcut between them (row 13).
//
// The two halves are deliberately unlike each other, and that is the point of a
// second door. The north half is hill and burnt wood, moderate going; the south
// half is bog, and everything in it wears. A courier arriving from Saltreach
// lands in the gentle half and a courier arriving from Fenmarch lands in the
// harsh one, so which neighbour you come from changes the journey, not just its
// length. Same destination, different cost (pillar 3).
//
// Legend:
//   . plains    f forest   # road
//   b bridge    ~ water    ^ mountain    h hills    m marsh
//   M deep-mire (wagon-gated)    x ford (locked shortcut)
//   p trail (rough path: drives like a path, wears like the ground it crosses,
//     so it is a visual link, not relief)
//
// Grid is 38 wide by 28 tall (1064 tiles, about 1.5x Fenmarch), the size step
// the expansion note asks for. createTileMap validates row lengths and symbols
// at load time.
//
// Trails (#176) link the off-road settlements without easing the sink: a row-9
// track runs west off the column-5 road to Cairnwatch, a short spur drops off
// the row-5 road end to Windfall, and a column-24 spur runs south off the row-23
// road to Blackreed. The Sallowmere pocket stays isolated by design.
//
// A drowned tarn seals the Sallowmere pocket in the south-east: a water wall
// down column 32 (rows 16-25) and across row 16 (cols 32-37), with one dry gap
// at the bottom (row 26). A single deep-mire tile at (32, 17) is the short way
// across, opened by the Marsh Treads upgrade or Off-road rank 2; without it
// Sallowmere is reached the long bog way south to the gap and back up the
// pocket. Deep mire rather than tidal flats because Ashmoor can be entered
// early from either spoke, and the cheaper capability is the fairer gate.
//
// Settlements:
//   emberfast  (30, 13)  home town, where the ford road meets the east road
//   cairnwatch (10, 9)   cairn-keepers' station in the northern hills
//   windfall   (34, 6)   timber camp in the north-east burnt wood
//   blackreed  (24, 26)  reed-cutters' camp in the southern bog
//   sallowmere (35, 18)  drowned holding behind the tarn, south-east pocket
//
// Gateways: (0, 4) leads north-west to Saltreach, (0, 23) leads south-west to
// Fenmarch. They sit 19 rows apart on purpose, so the two entrances open into
// different halves of the map. Spawn (1, 4) is one step east of the northern
// gateway on the road, used only on a fresh load; arriving by travel lands on
// the gateway that leads back (see arrivalTile).

import type { Settlement } from './settlements-greybridge';
import type { Contract } from '../systems/contract-system';
import { reconnectedFlag } from '../systems/world-state';

// ---------------------------------------------------------------------------
// Map rows
// ---------------------------------------------------------------------------

export const ASHMOOR_ROWS: readonly string[] = [
  // rows 0-3: NW peaks and the northern moor; water channel (col 16); the burnt
  // wood fills the whole north-east block
  '^^^^hhhhhhhh....~fffffffffffffffffffff',
  '^^^^hhhhhhhh....~fffffffffffffffffffff',
  '...hhhhhhhh.....~fffffffffffffffffffff',
  '...hhhhhhhh.....~fffffffffffffffffffff',
  // row 4: main north road, the surviving stretch of the Ember Road. Gateway(0)
  // to Saltreach, spawn(1); north bridge(16); runs east to the col-30 road
  '################b##############fffffff',
  // row 5: west hills off the col-5 road; the trail spur east to Windfall
  '.....#..........~.............#ppppfff',
  '.....#..........~.............#fffffff',
  '.hhh.#..........~.............#fffffff',
  '.hhh.#..........~.............#fffffff',
  // row 9: the cairn track runs west off the col-5 road to Cairnwatch (10,9)
  '.hhh.#pppphhhhhh~.............#fffffff',
  '.....#....hhhhhh~.............#fffffff',
  '.....#....hhhhhh~.............#.......',
  '.....#..........~.............#.......',
  // row 13: the ford shortcut (col 16, locked) on the old mid road, with its
  // signpost immediately west at (15,13). Links the two halves without the long
  // way round by either bridge; Emberfast (30,13) sits at its east end
  '.....###########x##############.......',
  '.....#..........~.............#.......',
  '.....#..........~.............#.......',
  // row 16: the bog begins east of the channel; the tarn wall closes the top of
  // the Sallowmere pocket (cols 32-37)
  '.....#..........~mmmmmmmmmmmmm#.~~~~~~',
  // rows 17-22: bog both sides of the channel. The tarn wall runs down col 32
  // with the single deep-mire crossing at (32,17) beside Sallowmere
  '.....#mmmmmmmmmm~mmmmmmmmmmmmm#mMmmmmm',
  '.....#mmmmmmmmmm~mmmmmmmmmmmmm#m~mmmmm',
  '.....#mmmmmmmmmm~mmmmmmmmmmmmm#m~mmmmm',
  '.....#mmmmmmmmmm~mmmmmmmmmmmmm#m~mmmmm',
  '.....#mmmmmmmmmm~mmmmmmmmmmmmm#m~mmmmm',
  '.....#mmmmmmmmmm~mmmmmmmmmmmmm#m~mmmmm',
  // row 23: main south road. Gateway(0) to Fenmarch; south bridge(16); runs east
  // to the col-30 road, closing the road loop
  '################b##############m~mmmmm',
  // rows 24-25: southern bog; the col-24 trail spur drops to Blackreed
  '^^^^....mmmmmmmm~mmmmmmmpmmmmmmm~mmmmm',
  '^^^^....mmmmmmmm~mmmmmmmpmmmmmmm~mmmmm',
  // rows 26-27: SW peaks and the deep bog; the one dry gap into the pocket is at
  // the bottom of the tarn wall (row 26, col 32)
  '^^^^....mmmmmmmm~mmmmmmmmmmmmmmmmmmmmm',
  '^^^^....mmmmmmmm~mmmmmmmmmmmmmmmmmmmmm',
];

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

export const ASHMOOR_LEGEND: Readonly<Record<string, string>> = {
  '.': 'plains',
  f: 'forest',
  '#': 'road',
  b: 'bridge',
  '~': 'water',
  '^': 'mountain',
  h: 'hills',
  m: 'marsh',
  M: 'deep-mire',
  x: 'ford-ashmoor',
  p: 'trail',
};

// ---------------------------------------------------------------------------
// Settlements  (ids must not clash with other regions' ids)
// ---------------------------------------------------------------------------

export const ASHMOOR_SETTLEMENTS: Readonly<Record<string, Settlement>> = {
  emberfast: {
    id: 'emberfast',
    name: 'Emberfast',
    tile: { x: 30, y: 13 },
    note: 'A waystation on the old Ember Road that never let its fire go out, on the argument that a road is only dead once nobody is waiting on it.',
  },
  cairnwatch: {
    id: 'cairnwatch',
    name: 'Cairnwatch',
    tile: { x: 10, y: 9 },
    note: 'A station of cairn-keepers who count the stones on the moor each season. The count has been going down, and they will not say by how much.',
  },
  windfall: {
    id: 'windfall',
    name: 'Windfall',
    tile: { x: 34, y: 6 },
    note: 'A timber camp working the burnt wood. They cut what the fire left standing and ask no questions about what started it.',
  },
  blackreed: {
    id: 'blackreed',
    name: 'Blackreed',
    tile: { x: 24, y: 26 },
    note: 'A reed-cutters camp on the black bog, built on poles and moved twice already. The reeds here come up dark and nobody sells them locally.',
  },
  sallowmere: {
    id: 'sallowmere',
    name: 'Sallowmere',
    tile: { x: 35, y: 18 },
    note: 'A holding behind the tarn that the water reached and then stopped, as though it had been told where to halt. Dry-shod couriers come the long way; the bold cross the mire.',
  },
};

// ---------------------------------------------------------------------------
// Contracts  (ids must not clash with other regions' ids)
//
// All optional. Ashmoor sits outside the Blockade spine in missions.ts by
// design (docs/design/10_open_world_expansion.md), so nothing here is arc-gated
// and nothing here is required to finish the game.
// ---------------------------------------------------------------------------

export const ASHMOOR_CONTRACTS: readonly Contract[] = [
  {
    id: 'ashmoor-ember-to-cairn',
    title: 'A Season of Stones',
    cargo: 'a keeper\'s tally',
    pickupId: 'emberfast',
    destinationId: 'cairnwatch',
    reward: 68,
    reputation: 2,
    minReputation: 0,
    note: 'The waystation keeps a copy of the cairn count, and this season the keepers want to check it against their own. Someone expects the two to disagree.',
    cargoType: 'letters',
  },
  {
    id: 'ashmoor-ember-to-windfall',
    title: 'Orders for the Burnt Wood',
    cargo: 'sealed cutting orders',
    pickupId: 'emberfast',
    destinationId: 'windfall',
    reward: 74,
    reputation: 2,
    minReputation: 0,
    note: 'Timber orders for a camp that has not been sent any in a year, signed by an office that is supposed to have closed.',
    cargoType: 'goods',
  },
  {
    id: 'ashmoor-ember-to-blackreed',
    title: 'Down to the Black Bog',
    cargo: 'salt, twine and lamp oil',
    pickupId: 'emberfast',
    destinationId: 'blackreed',
    reward: 88,
    reputation: 3,
    minReputation: 3,
    note: 'Blackreed has moved its camp again and sent up a list. The road runs out well short of them, and the last stretch is bog whichever way you take it.',
    cargoType: 'goods',
  },
  // Premium standing contract into the tarn pocket, mirroring Saltmere and
  // Fenholt: deliverable the long bog way round, with the deep-mire crossing as
  // the short way in. The gate opens a better route, never the only one.
  {
    id: 'ashmoor-cipher-to-sallowmere',
    title: 'A Word Behind the Tarn',
    cargo: 'an unmarked cipher',
    pickupId: 'emberfast',
    destinationId: 'sallowmere',
    reward: 124,
    reputation: 4,
    minReputation: 6,
    note: 'Sallowmere has sent nothing out and taken nothing in since the water came up. Someone at Emberfast still writes to it, and pays well to have the letters carried whichever way you can get them there.',
    cargoType: 'secrets',
  },
  // Second-wave work, opening as the moor reconnects.
  {
    id: 'ashmoor-cairn-relay',
    title: 'What the Keepers Heard',
    cargo: 'a keeper\'s account',
    pickupId: 'cairnwatch',
    destinationId: 'windfall',
    reward: 70,
    reputation: 2,
    minReputation: 0,
    note: 'The keepers have worked out what has been taking their stones, and want the timber camp warned before the cutting season starts.',
    cargoType: 'rumours',
    requires: { allOf: [reconnectedFlag('cairnwatch')] },
  },
  {
    id: 'ashmoor-blackreed-relay',
    title: 'The Dark Harvest',
    cargo: 'bundled black reed',
    pickupId: 'blackreed',
    destinationId: 'emberfast',
    reward: 82,
    reputation: 3,
    minReputation: 0,
    note: 'Blackreed is answering again, and it has a harvest nobody local will buy. Emberfast will take it, and will not explain why either.',
    cargoType: 'goods',
    requires: { allOf: [reconnectedFlag('blackreed')] },
  },
];

// ---------------------------------------------------------------------------
// Spawn and gateways
// ---------------------------------------------------------------------------

/**
 * Fresh-load starting position, one step east of the northern gateway on the
 * road. Arriving by travel lands on the gateway leading back to wherever the
 * courier came from, so this is only used on a cold start.
 */
export const ASHMOOR_SPAWN: { readonly x: number; readonly y: number } = { x: 1, y: 4 };

/** North-west gateway (x === 0, row 4) back to Saltreach, on the main north road. */
export const ASHMOOR_GATEWAY_SALTREACH: { readonly x: number; readonly y: number } = { x: 0, y: 4 };

/** South-west gateway (x === 0, row 23) back to Fenmarch, on the main south road. */
export const ASHMOOR_GATEWAY_FENMARCH: { readonly x: number; readonly y: number } = { x: 0, y: 23 };
