// Fenmarch Region tile data.
//
// A wooded fenland at the far edge of the known routes, reached by the
// causeway road west to the Greybridge hub. A single water channel splits the
// map down columns 9-10, crossed by one bridge on the main road (row 5). A
// north-south forest corridor at column 14 links a lake settlement in the
// north to a thorn-fenced hamlet in the south, and quiet peaks bookend the
// north-east and south-east corners.
//
// Legend:
//   . plains    f forest   # road
//   b bridge    ~ water    ^ mountain    x ford
//
// Grid is 20 wide by 11 tall. createTileMap validates row lengths and symbols
// at load time. A locked ford shortcut crosses the water channel on row 8 at
// columns 9-10, south of the main bridge. A signpost at (8, 8) unlocks it.
//
// Settlements:
//   mossgate   (4,  5)  home town, on the main west-east road
//   duskmere   (14, 2)  lake settlement north of the bridge, up the forest corridor
//   thornwick  (14, 8)  thorn-fenced hamlet south of the bridge, down the forest corridor
//   hollowfen  (18, 4)  hollow fenland stop east of the bridge, just off the road
//
// Gateway (0, 5) leads west, back to the Greybridge hub. Row 5 is a single road
// the entire width of the map, crossing the water on a bridge at columns 9-10.
// Spawn (1, 5) is one step east of the gateway on the road.

import type { Settlement } from './settlements-greybridge';
import type { Contract } from '../systems/contract-system';
import { reconnectedFlag } from '../systems/world-state';
import { FLAG_FENMARCH_COST } from './dialogue-content';

// ---------------------------------------------------------------------------
// Map rows
// ---------------------------------------------------------------------------

export const FENMARCH_ROWS: readonly string[] = [
  // row 0: forest patch west, water channel, twin peaks north-east
  '..ff.....~~...f..^^.',
  // row 1: forest thickens west, peaks continue north-east
  '.fff.....~~...f..^^.',
  // row 2: duskmere sits in the forest corridor north of the bridge
  '..ff.....~~...f.....',
  // row 3: open plains either side of the water
  '.........~~...f.....',
  // row 4: hollowfen sits on plains just north of the road
  '.........~~...f.....',
  // row 5: main west-east road; gateway(0), spawn(1), mossgate(4)
  '#########bb#########',
  // row 6: open plains either side of the water
  '.........~~...f.....',
  // row 7: forest patch west, forest corridor continues east
  '....f....~~...f.....',
  // row 8: thornwick sits in the forest corridor south of the bridge; ford
  // shortcut (locked) crosses the water at columns 9-10
  '...ff....xx...f.....',
  // row 9: south-west mountains begin, south-east peaks begin
  '..^^.....~~...f.^^^.',
  // row 10: south-west range closes, south-east range closes
  '.^^^.....~~.....^^^.',
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
  x: 'ford-fenmarch',
};

// ---------------------------------------------------------------------------
// Settlements  (ids must not clash with Greybridge or Saltreach ids)
// ---------------------------------------------------------------------------

export const FENMARCH_SETTLEMENTS: Readonly<Record<string, Settlement>> = {
  mossgate: {
    id: 'mossgate',
    name: 'Mossgate',
    tile: { x: 4, y: 5 },
    note: 'A moss-grown crossroads where the fen mist never quite lifts before noon.',
  },
  duskmere: {
    id: 'duskmere',
    name: 'Duskmere',
    tile: { x: 14, y: 2 },
    note: 'A quiet lake settlement where the water turns dark long before dusk actually falls.',
  },
  thornwick: {
    id: 'thornwick',
    name: 'Thornwick',
    tile: { x: 14, y: 8 },
    note: 'A thorn-fenced hamlet in the southern wood, its gates barred against something never named.',
  },
  hollowfen: {
    id: 'hollowfen',
    name: 'Hollowfen',
    tile: { x: 18, y: 4 },
    note: 'A hollow stretch of fenland where old stones still stand though no one recalls what they crossed.',
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
export const FENMARCH_SPAWN: { readonly x: number; readonly y: number } = { x: 1, y: 5 };

/** Settlement id that hosts the contract board and upgrade shop. */
export const FENMARCH_HOME = 'mossgate';
