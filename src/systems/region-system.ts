// Regions as data. Each region bundles its map, settlements, contracts, spawn,
// and a gateway tile that links to another region. The scene loads the active
// region from this registry and rebuilds itself from it.
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
  SALTREACH_GATEWAY,
} from '../data/region-saltreach';

export interface TileCoord {
  readonly x: number;
  readonly y: number;
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
  /** Tile that travels to the connected region when reached. */
  readonly gateway: TileCoord;
  /** Region id reachable through the gateway. */
  readonly connectsTo: string;
  /** Optional signpost tile that unlocks the ford (only where the mechanic lives). */
  readonly signpost?: TileCoord;
}

export const GREYBRIDGE_REGION: Region = {
  id: 'greybridge',
  name: 'Greybridge Region',
  rows: GREYBRIDGE_ROWS,
  legend: GREYBRIDGE_LEGEND,
  settlements: GREYBRIDGE_SETTLEMENTS,
  contracts: CONTRACTS_GREYBRIDGE,
  home: 'greywater',
  spawn: { x: 1, y: 5 },
  gateway: { x: 19, y: 5 },
  connectsTo: 'saltreach',
  signpost: { x: 8, y: 8 },
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
  gateway: SALTREACH_GATEWAY,
  connectsTo: 'greybridge',
};

export const REGIONS: Readonly<Record<string, Region>> = {
  greybridge: GREYBRIDGE_REGION,
  saltreach: SALTREACH_REGION,
};

export const DEFAULT_REGION_ID = 'greybridge';

/** Region for an id, falling back to the default region for unknown ids. */
export function getRegion(id: string): Region {
  return REGIONS[id] ?? GREYBRIDGE_REGION;
}

/** Settlement whose tile matches the coordinate within a region, if any. */
export function settlementAtTileIn(region: Region, x: number, y: number): Settlement | undefined {
  return Object.values(region.settlements).find((s) => s.tile.x === x && s.tile.y === y);
}

/** Total settlement count across every region (for exploration achievements). */
export function totalSettlementCount(): number {
  return Object.values(REGIONS).reduce((sum, r) => sum + Object.keys(r.settlements).length, 0);
}
