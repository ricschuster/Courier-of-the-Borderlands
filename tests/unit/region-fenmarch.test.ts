import { describe, it, expect } from 'vitest';
import { createTileMap, getTerrainIdAt } from '../../src/systems/tile-map';
import { isPassable, isPassableWith } from '../../src/systems/terrain-system';
import { findPath } from '../../src/systems/pathfinding';
import { traversalKeys, CAPABILITY_GRANTS } from '../../src/systems/traversal';
import { CARGO_CATEGORIES } from '../../src/systems/cargo-types';
import {
  FENMARCH_ROWS,
  FENMARCH_LEGEND,
  FENMARCH_SETTLEMENTS,
  FENMARCH_CONTRACTS,
  FENMARCH_SPAWN,
  FENMARCH_HOME,
} from '../../src/data/region-fenmarch';
import { REGIONS } from '../../src/systems/region-system';

const MAP_WIDTH = 20;
const MAP_HEIGHT = 11;

describe('Fenmarch map', () => {
  it('is a valid 20x11 map and createTileMap does not throw', () => {
    const map = createTileMap(FENMARCH_ROWS, FENMARCH_LEGEND);
    expect(map.width).toBe(MAP_WIDTH);
    expect(map.height).toBe(MAP_HEIGHT);
    expect(map.tiles).toHaveLength(MAP_WIDTH * MAP_HEIGHT);
  });

  it('has every row exactly MAP_WIDTH characters long', () => {
    for (const row of FENMARCH_ROWS) {
      expect(row).toHaveLength(MAP_WIDTH);
    }
  });

  it('uses only symbols present in the legend', () => {
    for (const row of FENMARCH_ROWS) {
      for (const symbol of row) {
        expect(FENMARCH_LEGEND[symbol], `unmapped symbol '${symbol}'`).toBeDefined();
      }
    }
  });

  it('has a water channel and at least one bridge crossing', () => {
    const map = createTileMap(FENMARCH_ROWS, FENMARCH_LEGEND);
    const hasBridge = map.tiles.some((t) => t === 'bridge');
    const hasWater = map.tiles.some((t) => t === 'water');
    expect(hasBridge).toBe(true);
    expect(hasWater).toBe(true);
  });

  it('has at least one ford', () => {
    const map = createTileMap(FENMARCH_ROWS, FENMARCH_LEGEND);
    expect(map.tiles.some((t) => t === 'ford-fenmarch')).toBe(true);
  });
});

describe('Fenmarch tidal-flat pocket (Fenholt)', () => {
  const map = createTileMap(FENMARCH_ROWS, FENMARCH_LEGEND);
  const mossgate = FENMARCH_SETTLEMENTS.mossgate!;
  const fenholt = FENMARCH_SETTLEMENTS.fenholt!;
  // The single gated crossing over the fen mere that walls off the pocket.
  const crossing = { x: 16, y: 7 };

  // The premium contract runs Mossgate -> Fenholt. The mere walls the pocket
  // north and south, so the tidal flat is a real shortcut and the dry way round
  // (out to the east verge on column 19) is always open.
  function routeLength(keys: ReadonlySet<string>): number | null {
    const path = findPath({
      width: map.width,
      height: map.height,
      isPassable: (x, y) => {
        const id = getTerrainIdAt(map, x, y);
        return id !== undefined && isPassableWith(id, keys);
      },
      start: mossgate.tile,
      goal: fenholt.tile,
    });
    return path.reachable ? path.path.length : null;
  }

  it('walls the pocket with a single tidal-flat crossing tile', () => {
    expect(getTerrainIdAt(map, crossing.x, crossing.y)).toBe('tidal-flat');
  });

  it('keeps the crossing blocked for the base wagon, open with tidal-crossing', () => {
    const id = getTerrainIdAt(map, crossing.x, crossing.y) as string;
    expect(isPassableWith(id, new Set())).toBe(false);
    expect(isPassableWith(id, new Set(['tidal-crossing']))).toBe(true);
  });

  it('reaches Fenholt the long way round without the flats, and shorter with them', () => {
    const base = routeLength(new Set());
    const withTidal = routeLength(new Set(['tidal-crossing']));
    // The base wagon can still get there, so the premium contract is never
    // soft-locked.
    expect(base).not.toBeNull();
    expect(withTidal).not.toBeNull();
    // Salt Runners / Off-road rank 3 opens the direct crossing: a strictly
    // shorter run.
    expect(withTidal!).toBeLessThan(base!);
  });

  it('grants tidal-crossing from Salt Runners or Off-road rank 3, not less', () => {
    expect(traversalKeys(new Set(), new Set(['salt-runners']), {}, CAPABILITY_GRANTS).has('tidal-crossing')).toBe(true);
    expect(traversalKeys(new Set(), new Set(), { 'off-road': 3 }, CAPABILITY_GRANTS).has('tidal-crossing')).toBe(true);
    expect(traversalKeys(new Set(), new Set(), { 'off-road': 2 }, CAPABILITY_GRANTS).has('tidal-crossing')).toBe(false);
  });
});

describe('Fenmarch settlements', () => {
  it('are exactly five in number', () => {
    expect(Object.keys(FENMARCH_SETTLEMENTS)).toHaveLength(5);
  });

  it('have unique ids', () => {
    const ids = Object.values(FENMARCH_SETTLEMENTS).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('do not reuse Greybridge or Saltreach settlement ids', () => {
    const existingIds = new Set([
      'greywater',
      'eastwatch',
      'southmill',
      'ironhollow',
      'tidewatch',
      'reedford',
      'saltkeep',
      'cormorant-rock',
    ]);
    for (const settlement of Object.values(FENMARCH_SETTLEMENTS)) {
      expect(existingIds.has(settlement.id)).toBe(false);
    }
  });

  it('sit on passable tiles within the map bounds', () => {
    const map = createTileMap(FENMARCH_ROWS, FENMARCH_LEGEND);
    for (const settlement of Object.values(FENMARCH_SETTLEMENTS)) {
      const { x, y } = settlement.tile;
      expect(x, `${settlement.id} x out of bounds`).toBeGreaterThanOrEqual(0);
      expect(x, `${settlement.id} x out of bounds`).toBeLessThan(MAP_WIDTH);
      expect(y, `${settlement.id} y out of bounds`).toBeGreaterThanOrEqual(0);
      expect(y, `${settlement.id} y out of bounds`).toBeLessThan(MAP_HEIGHT);
      const terrainId = getTerrainIdAt(map, x, y);
      expect(terrainId, `${settlement.id} tile is off the map`).toBeDefined();
      expect(
        isPassable(terrainId as string),
        `${settlement.id} sits on impassable terrain '${terrainId}'`,
      ).toBe(true);
    }
  });

  it('map key matches the settlement id property', () => {
    for (const [key, settlement] of Object.entries(FENMARCH_SETTLEMENTS)) {
      expect(settlement.id).toBe(key);
    }
  });

  it('has a home settlement present in the settlement list', () => {
    expect(FENMARCH_SETTLEMENTS[FENMARCH_HOME]).toBeDefined();
  });
});

describe('Fenmarch spawn', () => {
  it('is in bounds and on passable terrain', () => {
    const map = createTileMap(FENMARCH_ROWS, FENMARCH_LEGEND);
    const { x, y } = FENMARCH_SPAWN;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(MAP_WIDTH);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(MAP_HEIGHT);
    const terrainId = getTerrainIdAt(map, x, y);
    expect(terrainId).toBeDefined();
    expect(isPassable(terrainId as string)).toBe(true);
  });
});

describe('Fenmarch gateway', () => {
  it('has a gateway that links back to the greybridge hub', () => {
    const fenmarch = REGIONS.fenmarch;
    expect(fenmarch).toBeDefined();
    expect(fenmarch?.gateways.some((g) => g.to === 'greybridge')).toBe(true);
  });

  it('is in bounds and on passable terrain', () => {
    const map = createTileMap(FENMARCH_ROWS, FENMARCH_LEGEND);
    const fenmarch = REGIONS.fenmarch;
    for (const gateway of fenmarch?.gateways ?? []) {
      const { x, y } = gateway.tile;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(MAP_WIDTH);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(MAP_HEIGHT);
      const terrainId = getTerrainIdAt(map, x, y);
      expect(terrainId).toBeDefined();
      expect(isPassable(terrainId as string)).toBe(true);
    }
  });
});

describe('Fenmarch contracts', () => {
  it('has four standing contracts, one arc contract, and two reconnection-gated routes', () => {
    const standing = FENMARCH_CONTRACTS.filter((c) => c.requires === undefined);
    const arc = FENMARCH_CONTRACTS.filter((c) => c.arc === true);
    const secondWave = FENMARCH_CONTRACTS.filter((c) => c.requires !== undefined && c.arc !== true);
    // The fourth standing route is the premium run to mere-ringed Fenholt.
    expect(standing).toHaveLength(4);
    expect(arc).toHaveLength(1);
    expect(secondWave).toHaveLength(2);
  });

  it('have unique ids', () => {
    const ids = FENMARCH_CONTRACTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('do not reuse existing contract ids', () => {
    const existingIds = new Set([
      'letters-to-eastwatch',
      'grain-to-southmill',
      'rumours-to-ironhollow',
      'saltreach-tide-to-reed',
      'saltreach-tide-to-keep',
      'saltreach-tide-to-cormorant',
    ]);
    for (const contract of FENMARCH_CONTRACTS) {
      expect(existingIds.has(contract.id)).toBe(false);
    }
  });

  it('has a known cargoType for every contract', () => {
    for (const contract of FENMARCH_CONTRACTS) {
      expect(contract.cargoType, `${contract.id} missing cargoType`).toBeDefined();
      expect(
        CARGO_CATEGORIES[contract.cargoType as keyof typeof CARGO_CATEGORIES],
        `${contract.id} cargoType`,
      ).toBeDefined();
    }
  });

  it('reference pickup and destination ids that exist in FENMARCH_SETTLEMENTS', () => {
    for (const contract of FENMARCH_CONTRACTS) {
      expect(
        FENMARCH_SETTLEMENTS[contract.pickupId],
        `${contract.id} pickupId '${contract.pickupId}' not found`,
      ).toBeDefined();
      expect(
        FENMARCH_SETTLEMENTS[contract.destinationId],
        `${contract.id} destinationId '${contract.destinationId}' not found`,
      ).toBeDefined();
    }
  });

  it('have rewards between 60 and 120 inclusive (the premium Fenholt run pays most)', () => {
    for (const contract of FENMARCH_CONTRACTS) {
      expect(contract.reward, `${contract.id} reward out of range`).toBeGreaterThanOrEqual(60);
      expect(contract.reward, `${contract.id} reward out of range`).toBeLessThanOrEqual(120);
    }
  });

  it('have positive reputation rewards', () => {
    for (const contract of FENMARCH_CONTRACTS) {
      expect(contract.reputation, `${contract.id} reputation`).toBeGreaterThan(0);
    }
  });

  it('has at least one contract with minReputation 0 so the region is enterable', () => {
    expect(FENMARCH_CONTRACTS.some((c) => c.minReputation === 0)).toBe(true);
  });

  it('gates later contracts behind higher minReputation', () => {
    const sorted = [...FENMARCH_CONTRACTS].sort((a, b) => a.minReputation - b.minReputation);
    expect(sorted[0]?.minReputation).toBe(0);
    expect(sorted[sorted.length - 1]?.minReputation).toBeGreaterThan(0);
  });
});
