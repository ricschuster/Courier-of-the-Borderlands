// Regions as data. Each region bundles its map, settlements, contracts, spawn,
// and a list of gateway tiles that link to other regions. The scene loads the
// active region from this registry and rebuilds itself from it.
import type { Settlement } from '../data/settlements-greybridge';
import type { Contract } from './contract-system';
import { GREYBRIDGE_ROWS, GREYBRIDGE_LEGEND } from '../data/greybridge-map';
import { SETTLEMENTS as GREYBRIDGE_SETTLEMENTS } from '../data/settlements-greybridge';
import { CONTRACTS_GREYBRIDGE } from '../data/contracts-greybridge';
import {
  SALTREACH_ROWS,
  SALTREACH_LEGEND,
  SALTREACH_SETTLEMENTS,
  SALTREACH_CONTRACTS,
  SALTREACH_SPAWN,
} from '../data/region-saltreach';
import {
  FENMARCH_ROWS,
  FENMARCH_LEGEND,
  FENMARCH_SETTLEMENTS,
  FENMARCH_CONTRACTS,
  FENMARCH_SPAWN,
  FENMARCH_HOME,
} from '../data/region-fenmarch';
import {
  ASHMOOR_ROWS,
  ASHMOOR_LEGEND,
  ASHMOOR_SETTLEMENTS,
  ASHMOOR_CONTRACTS,
  ASHMOOR_SPAWN,
} from '../data/region-ashmoor';

export interface TileCoord {
  readonly x: number;
  readonly y: number;
}

/**
 * A tile that travels to another region, and the region id it leads to.
 *
 * Deliberately carries no capability requirement. Gateways used to support a
 * `requiresUpgrade` field (#362), and removing it is the point rather than an
 * omission: a gateway is *access*, and the rule is to gate shortcuts and never
 * access (docs/design/10_open_world_expansion.md). The map stays open and the
 * wilds do the gating, so the absence of the field is what enforces it.
 *
 * Shortcuts are still gated, through `terrain.unlockId` and `isPassableWith`,
 * which is a different mechanism because it leaves a longer way round.
 */
export interface RegionGateway {
  readonly tile: TileCoord;
  readonly to: string;
}

export interface Region {
  readonly id: string;
  readonly name: string;
  readonly rows: readonly string[];
  readonly legend: Readonly<Record<string, string>>;
  readonly settlements: Readonly<Record<string, Settlement>>;
  readonly contracts: readonly Contract[];
  /** Settlement id that hosts the contract board and upgrade shop. */
  readonly home: string;
  readonly spawn: TileCoord;
  /** Tiles that travel to a connected region when reached. A region may have more than one. */
  readonly gateways: readonly RegionGateway[];
  /** Optional signpost tile that unlocks the ford (only where the mechanic lives). */
  readonly signpost?: TileCoord;
  /** Unlock id for this region's own ford crossing, if it has one. */
  readonly fordUnlockId?: string;
  /**
   * Optional multiplier on the roughness-dependent wear per tile (#186). Defaults
   * to 1. A rougher region (e.g. Fenmarch) sets this above 1 so its off-road legs
   * bite harder late in the arc, when a big tank and maxed relief/off-road would
   * otherwise soak up the wear. Roads (roughness 0) are unaffected.
   */
  readonly wearMultiplier?: number;
}

export const GREYBRIDGE_REGION: Region = {
  id: 'greybridge',
  name: 'Greybridge Region',
  rows: GREYBRIDGE_ROWS,
  legend: GREYBRIDGE_LEGEND,
  settlements: GREYBRIDGE_SETTLEMENTS,
  contracts: CONTRACTS_GREYBRIDGE,
  home: 'greywater',
  spawn: { x: 1, y: 8 },
  // Greybridge is the hub. It links out to both spokes on different sides: east
  // on the main road to Saltreach (east map edge), and south down the east-bank
  // road to Fenmarch, whose gateway sits at the southern road terminus below
  // Southmill (not on the town, so its waymarker reads as a way out of the region).
  // Both roads out are open from the first minute (#434). They briefly required
  // the Reinforced Wheels (#362), which was an exit lock: an invisible wall on
  // the only way to anywhere else. The wheels are a pure speed upgrade with no
  // roughness relief, so it was a toll rather than a capability the road needed.
  // The world should be enterable everywhere and survivable only in places, so
  // the wilds do this job. See docs/design/10_open_world_expansion.md.
  gateways: [
    { tile: { x: 29, y: 8 }, to: 'saltreach' },
    { tile: { x: 21, y: 18 }, to: 'fenmarch' },
  ],
  signpost: { x: 13, y: 14 },
  fordUnlockId: 'ford-crossing-greybridge',
};

export const SALTREACH_REGION: Region = {
  id: 'saltreach',
  name: 'Saltreach',
  rows: SALTREACH_ROWS,
  legend: SALTREACH_LEGEND,
  settlements: SALTREACH_SETTLEMENTS,
  contracts: SALTREACH_CONTRACTS,
  home: 'tidewatch',
  spawn: SALTREACH_SPAWN,
  // No longer a dead-end spoke. West (0,10) leads back to the Greybridge hub;
  // east (29,10) carries the coast road on to Ashmoor, which also connects to
  // Fenmarch, so the world closes into a ring and a destination can be reached
  // more than one way (docs/design/10_open_world_expansion.md). The east gateway
  // sits at the plains end of the row-10 road, north of the Saltmere lagoon wall
  // so it stays outside the sealed pocket.
  gateways: [
    { tile: { x: 0, y: 10 }, to: 'greybridge' },
    { tile: { x: 29, y: 10 }, to: 'ashmoor' },
  ],
  // Immediately west of the ford tile (11,15), matching the Greybridge convention.
  signpost: { x: 10, y: 15 },
  fordUnlockId: 'ford-crossing-saltreach',
};

export const FENMARCH_REGION: Region = {
  id: 'fenmarch',
  name: 'Fenmarch',
  rows: FENMARCH_ROWS,
  legend: FENMARCH_LEGEND,
  settlements: FENMARCH_SETTLEMENTS,
  contracts: FENMARCH_CONTRACTS,
  home: FENMARCH_HOME,
  spawn: FENMARCH_SPAWN,
  // No longer a dead-end spoke either. West (0,11) leads back to the Greybridge
  // hub; east (31,11) carries the fen road on to Ashmoor, the other half of the
  // ring. The east gateway sits at the plains end of the row-11 road, north of
  // the Fenholt mere wall so it stays outside the sealed pocket.
  gateways: [
    { tile: { x: 0, y: 11 }, to: 'greybridge' },
    { tile: { x: 31, y: 11 }, to: 'ashmoor' },
  ],
  // Immediately west of the ford tile (12,16), matching the Greybridge convention.
  signpost: { x: 11, y: 16 },
  fordUnlockId: 'ford-crossing-fenmarch',
  // The final, roughest region reads too soft in the travel-sink measure (min
  // condition ~79 vs greybridge 0): by here the wagon has a big tank and maxed
  // relief/off-road, so its fen legs barely register. Push its off-road wear up
  // decisively so Fenmarch bites (#186). Playtest-gated starting value: at 2.2x
  // Fenmarch becomes the highest-wearing region in the measure (its off-road legs
  // cost the most coin to repair and strand a careless courier), which is the
  // decisive push the owner asked for. Easy to dial from here after a playtest.
  wearMultiplier: 2.2,
};

export const ASHMOOR_REGION: Region = {
  id: 'ashmoor',
  name: 'Ashmoor',
  rows: ASHMOOR_ROWS,
  legend: ASHMOOR_LEGEND,
  settlements: ASHMOOR_SETTLEMENTS,
  contracts: ASHMOOR_CONTRACTS,
  home: 'emberfast',
  spawn: ASHMOOR_SPAWN,
  // The region that closes the ring: it is the first with two gateways to two
  // different neighbours, so Ashmoor can be reached from either spoke and the
  // courier chooses which way round. They sit 19 rows apart, opening into the
  // gentle northern half and the boggy southern half respectively.
  gateways: [
    { tile: { x: 0, y: 4 }, to: 'saltreach' },
    { tile: { x: 0, y: 23 }, to: 'fenmarch' },
  ],
  // Immediately west of the ford tile (16,13), matching the convention in every
  // other region.
  signpost: { x: 15, y: 13 },
  fordUnlockId: 'ford-crossing-ashmoor',
  // Ashmoor is optional and enterable from either spoke, so it cannot assume a
  // maxed wagon the way Fenmarch (2.2x) can. It still has to bite: the southern
  // bog is the point of the place, and the expansion note's Gothic model wants a
  // world that is enterable everywhere and survivable only in places, now that
  // failure is cheap (#433).
  //
  // Measured against a bare wagon (no relief upgrades, no Off-road) and the
  // 25-point level-1 tank, on standard. The harness was calibrated by
  // reproducing the v43 figure for leaving the Greybridge hub (1.80) before any
  // of these were believed:
  //
  //   either gateway -> Emberfast   2.3-2.4  (9-10% of the tank)  road all the way
  //   Emberfast -> Cairnwatch      13.7      (55%)   north half
  //   Emberfast -> Windfall        14.9      (60%)   north half
  //   Emberfast -> Blackreed       23.2      (93%)   south half
  //   Emberfast -> Sallowmere      49.8      (199%)  south half, the long way
  //
  // That is the shape the Gothic model asks for: arriving is nearly free from
  // either direction, so nothing here is an exit lock, but a level-1 courier
  // gets roughly one delivery out of the place before stranding, and the bog is
  // flatly out of reach until the wagon grows or the mire crossing is bought.
  // Playtest-gated, sitting between Saltreach (1x) and Fenmarch (2.2x).
  wearMultiplier: 2.0,
};

export const REGIONS: Readonly<Record<string, Region>> = {
  greybridge: GREYBRIDGE_REGION,
  saltreach: SALTREACH_REGION,
  fenmarch: FENMARCH_REGION,
  ashmoor: ASHMOOR_REGION,
};

export const DEFAULT_REGION_ID = 'greybridge';

/** Region for an id, falling back to the default region for unknown ids. */
export function getRegion(id: string): Region {
  return REGIONS[id] ?? GREYBRIDGE_REGION;
}

/**
 * Where the courier should appear when entering a region.
 *
 * Arriving by travel from `fromRegionId` lands on the gateway that leads back
 * there, so the player steps out at the travel marker they would use to return,
 * not at the region's generic spawn point. A fresh load or new game (no origin,
 * or an origin with no matching gateway) falls back to the region spawn.
 */
export function arrivalTile(region: Region, fromRegionId?: string): TileCoord {
  if (fromRegionId !== undefined) {
    const back = region.gateways.find((g) => g.to === fromRegionId);
    if (back !== undefined) {
      return back.tile;
    }
  }
  return region.spawn;
}

/**
 * Where a loaded save resumes the courier (#315). The saved tile wins when it
 * is still passable, so a reload puts the wagon back where it stood instead of
 * granting a free tow home. No saved tile (an older save), or a tile the map
 * or unlock state has since invalidated, falls back to the region spawn.
 * Passability is asked of the caller because it depends on the live tile map
 * and the player's unlocks; out-of-bounds tiles must read as impassable.
 */
export function resumeTile(
  region: Region,
  saved: TileCoord | null,
  isPassableAt: (tile: TileCoord) => boolean,
): TileCoord {
  if (saved !== null && isPassableAt(saved)) {
    return saved;
  }
  return region.spawn;
}

/** Settlement whose tile matches the coordinate within a region, if any. */
export function settlementAtTileIn(region: Region, x: number, y: number): Settlement | undefined {
  return Object.values(region.settlements).find((s) => s.tile.x === x && s.tile.y === y);
}

/** Total settlement count across every region (for exploration achievements). */
export function totalSettlementCount(): number {
  return Object.values(REGIONS).reduce((sum, r) => sum + Object.keys(r.settlements).length, 0);
}
