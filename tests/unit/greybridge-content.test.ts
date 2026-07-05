import { describe, it, expect } from 'vitest';
import { createTileMap, getTerrainIdAt } from '../../src/systems/tile-map';
import { GREYBRIDGE_ROWS, GREYBRIDGE_LEGEND } from '../../src/data/greybridge-map';
import { SETTLEMENTS, settlementAtTile } from '../../src/data/settlements-greybridge';
import { CONTRACTS_GREYBRIDGE } from '../../src/data/contracts-greybridge';
import { isPassable } from '../../src/systems/terrain-system';
import { CARGO_CATEGORIES } from '../../src/systems/cargo-types';

const map = createTileMap(GREYBRIDGE_ROWS, GREYBRIDGE_LEGEND);

describe('Greybridge settlements', () => {
  it('sit on passable tiles within the map', () => {
    for (const settlement of Object.values(SETTLEMENTS)) {
      const terrainId = getTerrainIdAt(map, settlement.tile.x, settlement.tile.y);
      expect(terrainId, `${settlement.id} is off the map`).toBeDefined();
      expect(isPassable(terrainId as string), `${settlement.id} is on impassable terrain`).toBe(
        true,
      );
    }
  });

  it('can be looked up by tile coordinate', () => {
    const greywater = SETTLEMENTS.greywater;
    expect(greywater).toBeDefined();
    if (greywater !== undefined) {
      expect(settlementAtTile(greywater.tile.x, greywater.tile.y)?.id).toBe('greywater');
    }
    expect(settlementAtTile(-1, -1)).toBeUndefined();
  });

  it('contains all four expected settlements', () => {
    expect(SETTLEMENTS.greywater).toBeDefined();
    expect(SETTLEMENTS.eastwatch).toBeDefined();
    expect(SETTLEMENTS.southmill).toBeDefined();
    expect(SETTLEMENTS.ironhollow).toBeDefined();
  });
});

describe('Greybridge contracts', () => {
  it('reference settlements that exist', () => {
    for (const contract of CONTRACTS_GREYBRIDGE) {
      expect(SETTLEMENTS[contract.pickupId], `${contract.id} pickup`).toBeDefined();
      expect(SETTLEMENTS[contract.destinationId], `${contract.id} destination`).toBeDefined();
    }
  });

  it('reward currency and reputation on delivery', () => {
    for (const contract of CONTRACTS_GREYBRIDGE) {
      expect(contract.reward).toBeGreaterThan(0);
      expect(contract.reputation).toBeGreaterThan(0);
    }
  });

  it('has at least three contracts', () => {
    expect(CONTRACTS_GREYBRIDGE.length).toBeGreaterThanOrEqual(3);
  });

  it('has unique contract ids', () => {
    const ids = CONTRACTS_GREYBRIDGE.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('offers at least one contract at zero reputation so the game is startable', () => {
    expect(CONTRACTS_GREYBRIDGE.some((c) => c.minReputation === 0)).toBe(true);
  });

  it('has a known cargoType where set', () => {
    for (const contract of CONTRACTS_GREYBRIDGE) {
      if (contract.cargoType !== undefined) {
        expect(CARGO_CATEGORIES[contract.cargoType], `${contract.id} cargoType`).toBeDefined();
      }
    }
  });
});
