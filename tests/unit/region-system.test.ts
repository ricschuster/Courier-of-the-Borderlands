import { describe, it, expect } from 'vitest';
import {
  REGIONS,
  getRegion,
  settlementAtTileIn,
  totalSettlementCount,
  GREYBRIDGE_REGION,
  SALTREACH_REGION,
} from '../../src/systems/region-system';
import { createTileMap, getTerrainIdAt } from '../../src/systems/tile-map';
import { isPassable } from '../../src/systems/terrain-system';

describe('region-system', () => {
  it('registers greybridge and saltreach', () => {
    expect(Object.keys(REGIONS).sort()).toEqual(['greybridge', 'saltreach']);
  });

  it('getRegion falls back to greybridge for unknown ids', () => {
    expect(getRegion('nope')).toBe(GREYBRIDGE_REGION);
    expect(getRegion('saltreach').id).toBe('saltreach');
  });

  it('every region has a valid map, passable spawn and gateway, and links back', () => {
    for (const region of Object.values(REGIONS)) {
      const map = createTileMap(region.rows, region.legend);
      for (const tile of [region.spawn, region.gateway]) {
        const terrainId = getTerrainIdAt(map, tile.x, tile.y);
        expect(terrainId, `${region.id} tile off map`).toBeDefined();
        expect(isPassable(terrainId as string), `${region.id} tile impassable`).toBe(true);
      }
      // The connected region exists and links back to this one.
      const other = REGIONS[region.connectsTo];
      expect(other, `${region.id} connectsTo missing`).toBeDefined();
      expect(other?.connectsTo).toBe(region.id);
    }
  });

  it('settlements sit on passable tiles and look up by tile', () => {
    for (const region of Object.values(REGIONS)) {
      const map = createTileMap(region.rows, region.legend);
      for (const settlement of Object.values(region.settlements)) {
        const terrainId = getTerrainIdAt(map, settlement.tile.x, settlement.tile.y);
        expect(isPassable(terrainId as string), `${settlement.id} impassable`).toBe(true);
        expect(settlementAtTileIn(region, settlement.tile.x, settlement.tile.y)?.id).toBe(
          settlement.id,
        );
      }
    }
  });

  it('contract and settlement ids are globally unique across regions', () => {
    const contractIds = Object.values(REGIONS).flatMap((r) => r.contracts.map((c) => c.id));
    const settlementIds = Object.values(REGIONS).flatMap((r) => Object.keys(r.settlements));
    expect(new Set(contractIds).size).toBe(contractIds.length);
    expect(new Set(settlementIds).size).toBe(settlementIds.length);
  });

  it('each region home is one of its settlements', () => {
    for (const region of Object.values(REGIONS)) {
      expect(region.settlements[region.home], `${region.id} home missing`).toBeDefined();
    }
  });

  it('totalSettlementCount sums all regions', () => {
    const expected = Object.values(REGIONS).reduce(
      (n, r) => n + Object.keys(r.settlements).length,
      0,
    );
    expect(totalSettlementCount()).toBe(expected);
  });

  it('each region has its own ford unlock id, so unlocking one does not unlock the other', () => {
    expect(GREYBRIDGE_REGION.fordUnlockId).toBeDefined();
    expect(SALTREACH_REGION.fordUnlockId).toBeDefined();
    expect(GREYBRIDGE_REGION.fordUnlockId).not.toBe(SALTREACH_REGION.fordUnlockId);
  });

  it('saltreach has its own signpost for its ford unlock', () => {
    expect(SALTREACH_REGION.signpost).toBeDefined();
    expect(GREYBRIDGE_REGION.signpost).toBeDefined();
  });
});
