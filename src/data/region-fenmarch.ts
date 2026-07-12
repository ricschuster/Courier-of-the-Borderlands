// Fenmarch Region tile data.
//
// A wooded fenland at the far edge of the known routes, reached by the causeway
// road west to the Greybridge hub. The largest and roughest of the three maps:
// a single water channel splits it down column 12, crossed by the main bridge
// (row 11) and a locked ford shortcut (row 16). A wide north-south forest
// corridor (columns 13-21) fills the middle east with no road beside it, so the
// lake settlement in the north and the thorn-fenced hamlet in the south are
// reached only by pushing through the wood. Quiet peaks bookend the corners.
//
// The size and the road-free corridor are deliberate (issue #151): later maps
// must carry more travel-sink pressure than the Greybridge hub, and wear comes
// from rough ground, not road length. See docs/design/07_roads_gate_the_wagon.md.
//
// Legend:
//   . plains    f forest   # road
//   b bridge    ~ water    ^ mountain    h hills    m marsh
//   x ford    t tidal-flat (wagon-gated)
//
// Grid is 32 wide by 22 tall. createTileMap validates row lengths and symbols
// at load time. The locked ford crosses the water channel on row 16 at column
// 12, south of the main bridge. A signpost just west of it at (11, 16) unlocks it.
//
// A fen mere seals the Fenholt pocket in the south-east: a water wall down
// column 27 (rows 12-20) and across row 12 (cols 27-31), with one dry gap at
// the bottom (row 20). A single tidal-flat tile at (27, 13) is the short way in,
// opened by the Salt Runners upgrade or Off-road rank 3; without it Fenholt is
// reached the long marsh way down to the gap and back up the pocket.
//
// Settlements:
//   mossgate   (4,  11)  home town, on the main west-east road
//   duskmere   (16, 2)   lake settlement at the north end of the forest corridor
//   thornwick  (16, 19)  thorn-fenced hamlet at the south end, down into the fen
//   hollowfen  (26, 5)   hollow fenland stop in the north-east forest patch
//   fenholt    (30, 13)  drowned holt behind the mere, south-east pocket
//
// Gateway (0, 11) leads west, back to the Greybridge hub. Row 11 is a single
// road the entire width of the west block, crossing the water on a bridge at
// column 12. Spawn (1, 11) is one step east of the gateway on the road.

import type { Settlement } from './settlements-greybridge';
import type { Contract } from '../systems/contract-system';
import { reconnectedFlag } from '../systems/world-state';
import { FLAG_FENMARCH_COST } from './dialogue-content';

// ---------------------------------------------------------------------------
// Map rows
// ---------------------------------------------------------------------------

export const FENMARCH_ROWS: readonly string[] = [
  // rows 0-1: NW and NE peaks; water channel (col 12); the forest corridor
  // (cols 13-21) climbs to the duskmere lake in the north
  '^^^.........~fffffffff......^^^^',
  '^^^.........~fffffffff......^^^^',
  // rows 2-5: corridor continues; a north-east forest patch (cols 23-28) holds
  // hollowfen; west block is open plains with a road spur on col 5
  '............~fffffffff..........',
  '............~fffffffff.ffffff...',
  '............~fffffffff.ffffff...',
  '.....#......~fffffffff.ffffff...',
  // row 6: north-east road stub crosses toward the hollowfen forest patch
  '.....#......~fffffffff###ffff...',
  // rows 7-10: west hills off the road; corridor and NE patch continue
  '.hhh.#......~fffffffff#ffffff...',
  '.hhh.#......~fffffffff#ffffff...',
  '.hhh.#......~fffffffff#.........',
  '.....#......~fffffffff#.........',
  // row 11: main west-east road; gateway(0), spawn(1), mossgate(4); bridge(12);
  // crosses the corridor to the east spine (col 22)
  '############b##########.........',
  // rows 12-16: west hills; corridor continues south into fen; the fen mere
  // seals the Fenholt pocket - north wall on row 12 (cols 27-31), west wall on
  // col 27, tidal-flat crossing at (27,13) beside Fenholt
  '.....#......~fffffffff..mmm~~~~~',
  '..hhh#......~fffffffff..mmmtmmmm',
  '..hhh#......~fffffffff..mmm~mmmm',
  '..hhh#......~fffffffff..mmm~mmmm',
  // row 16: ford shortcut (col 12, locked); west approach on col 5; corridor
  // turns into fen to the south
  '.....######.xfffffffff..mmm~mmmm',
  // rows 17-19: southern fen marsh; thornwick sits down the corridor (16,19);
  // the mere wall continues down col 27
  '............~mmmmmmmmmmmmmm~mmmm',
  '............~mmmmmmmmmmmmmm~mmmm',
  '............~mmmmmmmmmmmmmm~mmmm',
  // rows 20-21: SW and SE mountain corners; the one dry gap into the pocket is
  // at the bottom of the mere (row 20, col 27)
  '^^^^........~mmmmmmmmmmmmmmmmmmm',
  '^^^^........~mmmmmmmmmmmmmmmmmmm',
];

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

export const FENMARCH_LEGEND: Readonly<Record<string, string>> = {
  '.': 'plains',
  f: 'forest',
  '#': 'road',
  b: 'bridge',
  '~': 'water',
  '^': 'mountain',
  h: 'hills',
  m: 'marsh',
  x: 'ford-fenmarch',
  t: 'tidal-flat',
};

// ---------------------------------------------------------------------------
// Settlements  (ids must not clash with Greybridge or Saltreach ids)
// ---------------------------------------------------------------------------

export const FENMARCH_SETTLEMENTS: Readonly<Record<string, Settlement>> = {
  mossgate: {
    id: 'mossgate',
    name: 'Mossgate',
    tile: { x: 4, y: 11 },
    note: 'A moss-grown crossroads where the fen mist never quite lifts before noon.',
  },
  duskmere: {
    id: 'duskmere',
    name: 'Duskmere',
    tile: { x: 16, y: 2 },
    note: 'A quiet lake settlement where the water turns dark long before dusk actually falls.',
  },
  thornwick: {
    id: 'thornwick',
    name: 'Thornwick',
    tile: { x: 16, y: 19 },
    note: 'A thorn-fenced hamlet in the southern wood, its gates barred against something never named.',
  },
  hollowfen: {
    id: 'hollowfen',
    name: 'Hollowfen',
    tile: { x: 26, y: 5 },
    note: 'A hollow stretch of fenland where old stones still stand though no one recalls what they crossed.',
  },
  fenholt: {
    id: 'fenholt',
    name: 'Fenholt',
    tile: { x: 30, y: 13 },
    note: 'A drowned holt in the south-east fen, cut off when the mere swallowed its causeway. Dry-shod couriers take the long way round by the east verge; the bold wade the flats.',
  },
};

// ---------------------------------------------------------------------------
// Contracts  (ids must not clash with Greybridge or Saltreach ids)
// ---------------------------------------------------------------------------

export const FENMARCH_CONTRACTS: readonly Contract[] = [
  {
    id: 'fenmarch-moss-to-dusk',
    title: 'Parcels for Duskmere',
    cargo: 'sealed reed baskets',
    pickupId: 'mossgate',
    destinationId: 'duskmere',
    reward: 65,
    reputation: 2,
    minReputation: 0,
    note: 'The baskets are light but the courier before you would not say what was inside. Duskmere will know.',
    cargoType: 'goods',
  },
  {
    id: 'fenmarch-moss-to-thorn',
    title: 'A Ledger for Thornwick',
    cargo: 'thorn-bound ledger',
    pickupId: 'mossgate',
    destinationId: 'thornwick',
    reward: 82,
    reputation: 3,
    minReputation: 3,
    note: 'Thornwick keeps its own accounts and trusts no one else to carry them. Do not read the pages.',
    cargoType: 'letters',
  },
  {
    id: 'fenmarch-moss-to-hollow',
    title: 'A Secret for Hollowfen',
    cargo: 'wax-sealed letter',
    pickupId: 'mossgate',
    destinationId: 'hollowfen',
    reward: 99,
    reputation: 3,
    minReputation: 6,
    note: 'No name, no seal mark, no explanation. Hollowfen has been waiting for this longer than you have been a courier.',
    cargoType: 'secrets',
  },
  // Premium standing contract to Fenholt, the mere-ringed holt. Deliverable the
  // long dry way round by the east verge, but the tidal-flat crossing (Salt
  // Runners, or Off-road rank 3) is the short way in: the gate opens a better
  // route, never the only one. Counts toward region clearance like the other
  // standing routes.
  {
    id: 'fenmarch-cipher-for-fenholt',
    title: 'A Cipher for Fenholt',
    cargo: 'a reed-wrapped cipher',
    pickupId: 'mossgate',
    destinationId: 'fenholt',
    reward: 115,
    reputation: 4,
    minReputation: 6,
    note: 'Fenholt drowned in a season and the fen closed over its road. Someone wants this carried to the holt behind the mere, and does not care whether you wade the flats or take the long verge. Pays like it matters.',
    cargoType: 'secrets',
  },
  // Arc-gated: appears once the warden's reveal is known (fenmarch_cost), when
  // the fen understands what the silence costs it. The courier carries the
  // hidden network's word up the water road (ADR 0004, M5.4).
  {
    id: 'fenmarch-lamp-for-duskmere',
    title: 'A Lamp for Duskmere',
    cargo: 'an unsigned letter',
    pickupId: 'mossgate',
    destinationId: 'duskmere',
    reward: 96,
    reputation: 3,
    minReputation: 0,
    note: 'The warden asks one more run of you. Duskmere let its water go dark; carry this up the corridor and give them a reason to light the lamps again. No seal. They will know the hand.',
    cargoType: 'secrets',
    requires: { allOf: [FLAG_FENMARCH_COST] },
    arc: true,
  },
  // Second-wave fen work, opening as the mist road revives (M5.4, Session 5).
  {
    id: 'fenmarch-dusk-relay',
    title: 'Duskmere Lights Up',
    cargo: 'a crate of lamp-oil',
    pickupId: 'duskmere',
    destinationId: 'thornwick',
    reward: 68,
    reputation: 2,
    minReputation: 0,
    note: 'Duskmere has its lamps lit again, and enough oil to spare a crate for Thornwick, who barred its gate and never reopened it. Bring them the means to see past their own wall.',
    cargoType: 'goods',
    requires: { allOf: [reconnectedFlag('duskmere')] },
  },
  {
    id: 'fenmarch-thorn-relay',
    title: 'Thornwick Opens the Gate',
    cargo: 'a peace-token',
    pickupId: 'thornwick',
    destinationId: 'hollowfen',
    reward: 74,
    reputation: 3,
    minReputation: 0,
    note: 'Thornwick has unbarred its gate at last, and sends a token down to Hollowfen, which waited longest of all. Carry it the length of the fen. Some letters are worth more than their weight.',
    cargoType: 'letters',
    requires: { allOf: [reconnectedFlag('thornwick')] },
  },
];

// ---------------------------------------------------------------------------
// Spawn
// ---------------------------------------------------------------------------

/** Starting position for the player courier in the Fenmarch region. */
export const FENMARCH_SPAWN: { readonly x: number; readonly y: number } = { x: 1, y: 11 };

/** Settlement id that hosts the contract board and upgrade shop. */
export const FENMARCH_HOME = 'mossgate';
