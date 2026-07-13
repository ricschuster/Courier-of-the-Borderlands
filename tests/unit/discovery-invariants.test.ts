import { describe, it, expect } from 'vitest';
import { DISCOVERIES } from '../../src/data/discoveries';
import { REGIONS, settlementAtTileIn, type Region } from '../../src/systems/region-system';
import { createTileMap, getTerrainIdAt, type TileMap } from '../../src/systems/tile-map';
import { isPassableWith } from '../../src/systems/terrain-system';

// Data-driven invariants over every authored wayside discovery, mirroring the
// encounter invariants. A discovery is found by revealing its tile, so if the
// tile drifted off the map, onto a wall, or onto a settlement, the lore would be
// silently unreachable (or read as a town). Using the same passability rule the
// scene uses means a pass here proves the courier can actually reach and reveal
// the tile in play.

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

describe('every discovery is placed on a reachable tile', () => {
  it.each(DISCOVERIES.map((d) => [d.id, d] as const))('%s', (_id, discovery) => {
    const region = REGIONS[discovery.regionId];
    expect(
      region,
      `discovery ${discovery.id} names unknown region ${discovery.regionId}`,
    ).toBeDefined();
    const map = mapFor(region!);
    const { x, y } = discovery.tile;

    const terrainId = getTerrainIdAt(map, x, y);
    expect(terrainId, `discovery ${discovery.id} tile is off the map`).toBeDefined();
    expect(
      terrainId !== undefined && isPassableWith(terrainId, NO_UNLOCKS),
      `discovery ${discovery.id} tile (${x},${y}) is not base-passable`,
    ).toBe(true);

    expect(
      settlementAtTileIn(region!, x, y),
      `discovery ${discovery.id} sits on a settlement tile; discoveries are wayside finds, not towns`,
    ).toBeUndefined();
  });
});

describe('discovery placement is unambiguous', () => {
  it('gives every discovery a unique id', () => {
    const ids = DISCOVERIES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never puts two discoveries on the same region tile', () => {
    const keys = DISCOVERIES.map((d) => `${d.regionId}:${d.tile.x},${d.tile.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every discovery non-empty lore', () => {
    for (const d of DISCOVERIES) {
      expect(d.title.length, `discovery ${d.id} has an empty title`).toBeGreaterThan(0);
      expect(d.note.length, `discovery ${d.id} has an empty note`).toBeGreaterThan(0);
    }
  });
});
