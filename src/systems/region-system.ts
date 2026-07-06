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

export interface TileCoord {
  readonly x: number;
  readonly y: number;
}

/** A tile that travels to another region, and the region id it leads to. */
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
  // on the main road to Saltreach, and south (over the bridge, then down the
  // east-bank road) to Fenmarch, whose gateway sits on the Southmill tile.
  gateways: [
    { tile: { x: 29, y: 8 }, to: 'saltreach' },
    { tile: { x: 21, y: 14 }, to: 'fenmarch' },
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
  // A spoke off the Greybridge hub: its only gateway leads west, back to
  // Greybridge.
  gateways: [{ tile: { x: 0, y: 5 }, to: 'greybridge' }],
  signpost: { x: 6, y: 6 },
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
  // A spoke off the Greybridge hub: its only gateway leads west, back to
  // Greybridge.
  gateways: [{ tile: { x: 0, y: 5 }, to: 'greybridge' }],
  signpost: { x: 8, y: 8 },
  fordUnlockId: 'ford-crossing-fenmarch',
};

export const REGIONS: Readonly<Record<string, Region>> = {
  greybridge: GREYBRIDGE_REGION,
  saltreach: SALTREACH_REGION,
  fenmarch: FENMARCH_REGION,
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

/** Settlement whose tile matches the coordinate within a region, if any. */
export function settlementAtTileIn(region: Region, x: number, y: number): Settlement | undefined {
  return Object.values(region.settlements).find((s) => s.tile.x === x && s.tile.y === y);
}

/** Total settlement count across every region (for exploration achievements). */
export function totalSettlementCount(): number {
  return Object.values(REGIONS).reduce((sum, r) => sum + Object.keys(r.settlements).length, 0);
}
