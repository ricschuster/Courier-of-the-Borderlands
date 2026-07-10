import { describe, it, expect } from 'vitest';
import { createTileMap, getTerrainIdAt } from '../../src/systems/tile-map';
import { GREYBRIDGE_ROWS, GREYBRIDGE_LEGEND } from '../../src/data/greybridge-map';
import { SETTLEMENTS, settlementAtTile } from '../../src/data/settlements-greybridge';
import { CONTRACTS_GREYBRIDGE } from '../../src/data/contracts-greybridge';
import { isPassable, isPassableWith } from '../../src/systems/terrain-system';
import { findPath } from '../../src/systems/pathfinding';
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

  it('contains all seven expected settlements', () => {
    expect(SETTLEMENTS.greywater).toBeDefined();
    expect(SETTLEMENTS.northcairn).toBeDefined();
    expect(SETTLEMENTS.eastwatch).toBeDefined();
    expect(SETTLEMENTS.southmill).toBeDefined();
    expect(SETTLEMENTS.ironhollow).toBeDefined();
    expect(SETTLEMENTS.mirewatch).toBeDefined();
    expect(SETTLEMENTS.reedgrave).toBeDefined();
  });
});

describe('Greybridge deep-mire pocket (Reedgrave)', () => {
  const mirewatch = SETTLEMENTS.mirewatch!;
  const reedgrave = SETTLEMENTS.reedgrave!;
  // The single gated crossing over the black channel that walls off the pocket.
  const crossing = { x: 26, y: 19 };

  // The premium contract runs Mirewatch -> Reedgrave: both sit at the pocket's
  // latitude, so the channel blocks the direct line and the mire is a real
  // shortcut (a start from the north-west would approach round the top for free).
  function routeLength(keys: ReadonlySet<string>): number | null {
    const path = findPath({
      width: map.width,
      height: map.height,
      isPassable: (x, y) => {
        const id = getTerrainIdAt(map, x, y);
        return id !== undefined && isPassableWith(id, keys);
      },
      start: mirewatch.tile,
      goal: reedgrave.tile,
    });
    return path.reachable ? path.path.length : null;
  }

  it('walls the pocket with a single deep-mire crossing tile', () => {
    expect(getTerrainIdAt(map, crossing.x, crossing.y)).toBe('deep-mire');
  });

  it('keeps the crossing blocked for the base wagon, open with mire-crossing', () => {
    const id = getTerrainIdAt(map, crossing.x, crossing.y) as string;
    expect(isPassableWith(id, new Set())).toBe(false);
    expect(isPassableWith(id, new Set(['mire-crossing']))).toBe(true);
  });

  it('reaches Reedgrave the long way round without the mire, and shorter with it', () => {
    const base = routeLength(new Set());
    const withMire = routeLength(new Set(['mire-crossing']));
    // The base wagon can still get there (the reeds are reached round the north
    // end of the channel), so the premium contract is never soft-locked.
    expect(base).not.toBeNull();
    expect(withMire).not.toBeNull();
    // Marsh Treads / off-road opens the direct crossing: a strictly shorter run.
    expect(withMire!).toBeLessThan(base!);
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
