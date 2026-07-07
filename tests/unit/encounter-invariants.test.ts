import { describe, it, expect } from 'vitest';
import { ENCOUNTERS } from '../../src/data/encounters';
import { REGIONS, settlementAtTileIn, type Region } from '../../src/systems/region-system';
import { createTileMap, getTerrainIdAt, type TileMap } from '../../src/systems/tile-map';
import { isPassableWith } from '../../src/systems/terrain-system';
import {
  validateEncounter,
  pickEncounter,
  resolutionFlags,
} from '../../src/systems/encounter-system';
import { emptyFlags, flagsFromArray } from '../../src/systems/dialogue';

// Data-driven invariants over every authored road encounter, mirroring
// region-invariants. These guard against content drifting off the map: an
// encounter whose trigger tile became impassable, landed on a settlement, or
// whose dialogue is malformed would silently never fire (or fire on a town).
// Because trigger tiles use the same passability rule the scene uses, a pass
// here means the courier can actually reach and resolve the encounter in play.

const NO_UNLOCKS: ReadonlySet<string> = new Set();

const mapCache = new Map<string, TileMap>();
function mapFor(region: Region): TileMap {
  const cached = mapCache.get(region.id);
  if (cached !== undefined) {
    return cached;
  }
  const map = createTileMap(region.rows, region.legend);
  mapCache.set(region.id, map);
  return map;
}

describe('every encounter is structurally valid', () => {
  it.each(ENCOUNTERS.map((e) => [e.id, e] as const))('%s', (_id, encounter) => {
    expect(validateEncounter(encounter)).toEqual([]);
  });
});

describe('every encounter is placed on the map', () => {
  it.each(ENCOUNTERS.map((e) => [e.id, e] as const))('%s', (_id, encounter) => {
    const region = REGIONS[encounter.regionId];
    expect(region, `encounter ${encounter.id} names unknown region ${encounter.regionId}`).toBeDefined();
    const map = mapFor(region!);
    const { x, y } = encounter.tile;

    const terrainId = getTerrainIdAt(map, x, y);
    expect(terrainId, `encounter ${encounter.id} tile is off the map`).toBeDefined();
    expect(
      terrainId !== undefined && isPassableWith(terrainId, NO_UNLOCKS),
      `encounter ${encounter.id} tile (${x},${y}) is not base-passable`,
    ).toBe(true);

    expect(
      settlementAtTileIn(region!, x, y),
      `encounter ${encounter.id} sits on a settlement tile; encounters are drive-through, not NPC talk`,
    ).toBeUndefined();
  });
});

describe('encounter placement is unambiguous', () => {
  it('gives every encounter a unique id', () => {
    const ids = ENCOUNTERS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never puts two encounters on the same region tile', () => {
    const keys = ENCOUNTERS.map((e) => `${e.regionId}:${e.tile.x},${e.tile.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('every encounter fires when reached and is one-shot', () => {
  it.each(ENCOUNTERS.map((e) => [e.id, e] as const))('%s', (_id, encounter) => {
    const query = { regionId: encounter.regionId, tile: encounter.tile };

    // Unresolved: the encounter fires at its tile.
    expect(pickEncounter(ENCOUNTERS, { ...query, flags: emptyFlags() })?.id).toBe(encounter.id);

    // Resolved by any one of its outcome flags: it never fires again.
    for (const flag of resolutionFlags(encounter)) {
      expect(
        pickEncounter(ENCOUNTERS, { ...query, flags: flagsFromArray([flag]) }),
        `encounter ${encounter.id} still fires after ${flag}`,
      ).toBeUndefined();
    }
  });
});
