import { describe, it, expect } from 'vitest';
import {
  REGIONS,
  getRegion,
  arrivalTile,
  settlementAtTileIn,
  totalSettlementCount,
  GREYBRIDGE_REGION,
  SALTREACH_REGION,
  FENMARCH_REGION,
} from '../../src/systems/region-system';
import { createTileMap, getTerrainIdAt } from '../../src/systems/tile-map';
import { isPassable } from '../../src/systems/terrain-system';

describe('region-system', () => {
  it('registers greybridge, saltreach, and fenmarch', () => {
    expect(Object.keys(REGIONS).sort()).toEqual(['fenmarch', 'greybridge', 'saltreach']);
  });

  it('getRegion falls back to greybridge for unknown ids', () => {
    expect(getRegion('nope')).toBe(GREYBRIDGE_REGION);
    expect(getRegion('saltreach').id).toBe('saltreach');
  });

  it('every region has a valid map, passable spawn and gateways, and links back', () => {
    for (const region of Object.values(REGIONS)) {
      const map = createTileMap(region.rows, region.legend);
      const tiles = [region.spawn, ...region.gateways.map((g) => g.tile)];
      for (const tile of tiles) {
        const terrainId = getTerrainIdAt(map, tile.x, tile.y);
        expect(terrainId, `${region.id} tile off map`).toBeDefined();
        expect(isPassable(terrainId as string), `${region.id} tile impassable`).toBe(true);
      }
      // Every gateway's destination region exists and links back to this one.
      for (const gateway of region.gateways) {
        const other = REGIONS[gateway.to];
        expect(other, `${region.id} gateway to '${gateway.to}' missing`).toBeDefined();
        const linksBack = other?.gateways.some((g) => g.to === region.id) ?? false;
        expect(linksBack, `${gateway.to} does not link back to ${region.id}`).toBe(true);
      }
    }
  });

  it('forms a hub: greybridge links to both spokes, each spoke links only back', () => {
    const greybridge = REGIONS.greybridge;
    const saltreach = REGIONS.saltreach;
    const fenmarch = REGIONS.fenmarch;
    // Greybridge is the hub: it reaches both other regions.
    expect(greybridge?.gateways.map((g) => g.to).sort()).toEqual(['fenmarch', 'saltreach']);
    // The spokes each link only back to the hub, never directly to each other.
    expect(saltreach?.gateways.map((g) => g.to)).toEqual(['greybridge']);
    expect(fenmarch?.gateways.map((g) => g.to)).toEqual(['greybridge']);
  });

  it('greybridge has two gateways, one to each spoke, on distinct tiles', () => {
    const greybridge = REGIONS.greybridge;
    expect(greybridge?.gateways).toHaveLength(2);
    const toSalt = greybridge?.gateways.find((g) => g.to === 'saltreach');
    const toFen = greybridge?.gateways.find((g) => g.to === 'fenmarch');
    expect(toSalt).toBeDefined();
    expect(toFen).toBeDefined();
    // The two gateways must not share a tile, or arrival would be ambiguous.
    expect(toSalt?.tile).not.toEqual(toFen?.tile);
  });

  describe('arrivalTile', () => {
    it('lands on the return gateway when arriving by travel', () => {
      // Coming into Greybridge from Saltreach: step out at the gateway that
      // leads back to Saltreach, not at the Greybridge spawn.
      const back = GREYBRIDGE_REGION.gateways.find((g) => g.to === 'saltreach');
      expect(arrivalTile(GREYBRIDGE_REGION, 'saltreach')).toEqual(back?.tile);
      expect(arrivalTile(GREYBRIDGE_REGION, 'saltreach')).not.toEqual(GREYBRIDGE_REGION.spawn);

      const backFromFen = GREYBRIDGE_REGION.gateways.find((g) => g.to === 'fenmarch');
      expect(arrivalTile(GREYBRIDGE_REGION, 'fenmarch')).toEqual(backFromFen?.tile);
    });

    it('lands on the spoke return gateway when arriving from the hub', () => {
      const saltBack = SALTREACH_REGION.gateways.find((g) => g.to === 'greybridge');
      expect(arrivalTile(SALTREACH_REGION, 'greybridge')).toEqual(saltBack?.tile);
      const fenBack = FENMARCH_REGION.gateways.find((g) => g.to === 'greybridge');
      expect(arrivalTile(FENMARCH_REGION, 'greybridge')).toEqual(fenBack?.tile);
    });

    it('falls back to spawn for a fresh load or an unconnected origin', () => {
      expect(arrivalTile(GREYBRIDGE_REGION)).toEqual(GREYBRIDGE_REGION.spawn);
      // Fenmarch has no direct gateway from Saltreach in the hub layout, so an
      // origin it does not link back to falls through to spawn.
      expect(arrivalTile(FENMARCH_REGION, 'saltreach')).toEqual(FENMARCH_REGION.spawn);
    });
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
