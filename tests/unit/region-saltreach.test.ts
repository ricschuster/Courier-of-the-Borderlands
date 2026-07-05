import { describe, it, expect } from 'vitest';
import { createTileMap, getTerrainIdAt } from '../../src/systems/tile-map';
import { isPassable } from '../../src/systems/terrain-system';
import {
  SALTREACH_ROWS,
  SALTREACH_LEGEND,
  SALTREACH_SETTLEMENTS,
  SALTREACH_CONTRACTS,
  SALTREACH_SPAWN,
  SALTREACH_GATEWAY,
} from '../../src/data/region-saltreach';

const MAP_WIDTH = 20;
const MAP_HEIGHT = 11;

describe('Saltreach map', () => {
  it('is a valid 20x11 map and createTileMap does not throw', () => {
    const map = createTileMap(SALTREACH_ROWS, SALTREACH_LEGEND);
    expect(map.width).toBe(MAP_WIDTH);
    expect(map.height).toBe(MAP_HEIGHT);
    expect(map.tiles).toHaveLength(MAP_WIDTH * MAP_HEIGHT);
  });

  it('has a water channel and at least one bridge crossing', () => {
    const map = createTileMap(SALTREACH_ROWS, SALTREACH_LEGEND);
    const hasBridge = map.tiles.some((t) => t === 'bridge');
    const hasWater = map.tiles.some((t) => t === 'water');
    expect(hasBridge).toBe(true);
    expect(hasWater).toBe(true);
  });

  it('has at least one ford', () => {
    const map = createTileMap(SALTREACH_ROWS, SALTREACH_LEGEND);
    expect(map.tiles.some((t) => t === 'ford-saltreach')).toBe(true);
  });
});

describe('Saltreach settlements', () => {
  it('are exactly four in number', () => {
    expect(Object.keys(SALTREACH_SETTLEMENTS)).toHaveLength(4);
  });

  it('have unique ids', () => {
    const ids = Object.values(SALTREACH_SETTLEMENTS).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('do not reuse Greybridge settlement ids', () => {
    const greybridgeIds = new Set(['greywater', 'eastwatch', 'southmill', 'ironhollow']);
    for (const settlement of Object.values(SALTREACH_SETTLEMENTS)) {
      expect(greybridgeIds.has(settlement.id)).toBe(false);
    }
  });

  it('sit on passable tiles within the map bounds', () => {
    const map = createTileMap(SALTREACH_ROWS, SALTREACH_LEGEND);
    for (const settlement of Object.values(SALTREACH_SETTLEMENTS)) {
      const { x, y } = settlement.tile;
      expect(x, `${settlement.id} x out of bounds`).toBeGreaterThanOrEqual(0);
      expect(x, `${settlement.id} x out of bounds`).toBeLessThan(MAP_WIDTH);
      expect(y, `${settlement.id} y out of bounds`).toBeGreaterThanOrEqual(0);
      expect(y, `${settlement.id} y out of bounds`).toBeLessThan(MAP_HEIGHT);
      const terrainId = getTerrainIdAt(map, x, y);
      expect(terrainId, `${settlement.id} tile is off the map`).toBeDefined();
      // terrainId is string | undefined; the toBeDefined check above guards this
      expect(
        isPassable(terrainId as string),
        `${settlement.id} sits on impassable terrain '${terrainId}'`,
      ).toBe(true);
    }
  });

  it('map key matches the settlement id property', () => {
    for (const [key, settlement] of Object.entries(SALTREACH_SETTLEMENTS)) {
      expect(settlement.id).toBe(key);
    }
  });
});

describe('Saltreach spawn', () => {
  it('is in bounds and on passable terrain', () => {
    const map = createTileMap(SALTREACH_ROWS, SALTREACH_LEGEND);
    const { x, y } = SALTREACH_SPAWN;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(MAP_WIDTH);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(MAP_HEIGHT);
    const terrainId = getTerrainIdAt(map, x, y);
    expect(terrainId).toBeDefined();
    expect(isPassable(terrainId as string)).toBe(true);
  });
});

describe('Saltreach gateway', () => {
  it('has x === 0 (west edge)', () => {
    expect(SALTREACH_GATEWAY.x).toBe(0);
  });

  it('is in bounds and on passable terrain', () => {
    const map = createTileMap(SALTREACH_ROWS, SALTREACH_LEGEND);
    const { x, y } = SALTREACH_GATEWAY;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(MAP_WIDTH);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(MAP_HEIGHT);
    const terrainId = getTerrainIdAt(map, x, y);
    expect(terrainId).toBeDefined();
    expect(isPassable(terrainId as string)).toBe(true);
  });
});

describe('Saltreach contracts', () => {
  it('has exactly three contracts', () => {
    expect(SALTREACH_CONTRACTS).toHaveLength(3);
  });

  it('have unique ids', () => {
    const ids = SALTREACH_CONTRACTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('do not reuse Greybridge contract ids', () => {
    const greybridgeIds = new Set([
      'letters-to-eastwatch',
      'grain-to-southmill',
      'rumours-to-ironhollow',
    ]);
    for (const contract of SALTREACH_CONTRACTS) {
      expect(greybridgeIds.has(contract.id)).toBe(false);
    }
  });

  it('reference pickup and destination ids that exist in SALTREACH_SETTLEMENTS', () => {
    for (const contract of SALTREACH_CONTRACTS) {
      expect(
        SALTREACH_SETTLEMENTS[contract.pickupId],
        `${contract.id} pickupId '${contract.pickupId}' not found`,
      ).toBeDefined();
      expect(
        SALTREACH_SETTLEMENTS[contract.destinationId],
        `${contract.id} destinationId '${contract.destinationId}' not found`,
      ).toBeDefined();
    }
  });

  it('have rewards between 60 and 95 inclusive', () => {
    for (const contract of SALTREACH_CONTRACTS) {
      expect(contract.reward, `${contract.id} reward out of range`).toBeGreaterThanOrEqual(60);
      expect(contract.reward, `${contract.id} reward out of range`).toBeLessThanOrEqual(95);
    }
  });

  it('have positive reputation rewards', () => {
    for (const contract of SALTREACH_CONTRACTS) {
      expect(contract.reputation, `${contract.id} reputation`).toBeGreaterThan(0);
    }
  });

  it('has at least one contract with minReputation 0 so the region is enterable', () => {
    expect(SALTREACH_CONTRACTS.some((c) => c.minReputation === 0)).toBe(true);
  });

  it('gates later contracts behind higher minReputation', () => {
    const sorted = [...SALTREACH_CONTRACTS].sort((a, b) => a.minReputation - b.minReputation);
    expect(sorted[0]?.minReputation).toBe(0);
    expect(sorted[sorted.length - 1]?.minReputation).toBeGreaterThan(0);
  });
});
