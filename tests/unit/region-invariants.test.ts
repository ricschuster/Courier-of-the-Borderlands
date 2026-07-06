import { describe, it, expect } from 'vitest';
import { REGIONS, type Region } from '../../src/systems/region-system';
import { createTileMap, getTerrainIdAt, type TileMap } from '../../src/systems/tile-map';
import { getTerrain, isPassableWith } from '../../src/systems/terrain-system';
import { findPath, type PathNode, type PathResult } from '../../src/systems/pathfinding';

// Data-driven invariants over every authored region. These are "property"
// tests in the sense that the properties must hold for all shipped regions and
// contracts, not random inputs: the meaningful input space is the hand-authored
// content, and these guards catch a map that is unwinnable, a contract pointing
// at a missing or unreachable settlement, or a ford that is not actually a
// shortcut. They mirror the game's own pathfinding (4-directional BFS over the
// same passability rule the scene uses) so a pass here means the route exists
// in play.

const NO_UNLOCKS: ReadonlySet<string> = new Set();

function gridFor(region: Region): TileMap {
  return createTileMap(region.rows, region.legend);
}

/** Passability closure matching MapScene: unknown terrain is blocked. */
function passableFn(map: TileMap, unlocks: ReadonlySet<string>): (x: number, y: number) => boolean {
  return (x, y) => {
    const id = getTerrainIdAt(map, x, y);
    return id !== undefined && isPassableWith(id, unlocks);
  };
}

function route(map: TileMap, from: PathNode, to: PathNode, unlocks: ReadonlySet<string>): PathResult {
  return findPath({
    width: map.width,
    height: map.height,
    isPassable: passableFn(map, unlocks),
    start: from,
    goal: to,
  });
}

const ORTHOGONAL: readonly PathNode[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

const regionEntries = Object.entries(REGIONS);

describe.each(regionEntries)('region invariants: %s', (_id, region) => {
  const map = gridFor(region);
  const basePassable = passableFn(map, NO_UNLOCKS);
  const home = region.settlements[region.home];

  it('has a home settlement present in its settlement table', () => {
    expect(home, `home id '${region.home}' is not a settlement in ${region.id}`).toBeDefined();
  });

  it('spawns the courier on passable ground', () => {
    expect(basePassable(region.spawn.x, region.spawn.y)).toBe(true);
  });

  it('places every settlement on passable ground reachable from home without unlocks', () => {
    expect(home).toBeDefined();
    for (const s of Object.values(region.settlements)) {
      expect(basePassable(s.tile.x, s.tile.y), `settlement ${s.id} is on impassable ground`).toBe(
        true,
      );
      const path = route(map, home!.tile, s.tile, NO_UNLOCKS);
      expect(path.reachable, `no base route ${region.home} -> ${s.id}`).toBe(true);
    }
  });

  it('places every gateway on passable ground reachable from home without unlocks', () => {
    expect(home).toBeDefined();
    for (const g of region.gateways) {
      expect(basePassable(g.tile.x, g.tile.y), `gateway to ${g.to} is on impassable ground`).toBe(
        true,
      );
      const path = route(map, home!.tile, g.tile, NO_UNLOCKS);
      expect(path.reachable, `no base route ${region.home} -> gateway(${g.to})`).toBe(true);
    }
  });

  it('gives every contract real endpoints with a base pickup -> destination route', () => {
    for (const c of region.contracts) {
      const pickup = region.settlements[c.pickupId];
      const dest = region.settlements[c.destinationId];
      expect(pickup, `contract ${c.id} pickup '${c.pickupId}' is missing`).toBeDefined();
      expect(dest, `contract ${c.id} destination '${c.destinationId}' is missing`).toBeDefined();
      const path = route(map, pickup!.tile, dest!.tile, NO_UNLOCKS);
      expect(path.reachable, `contract ${c.id}: no route ${c.pickupId} -> ${c.destinationId}`).toBe(
        true,
      );
    }
  });
});

const fordRegions = regionEntries.filter(([, r]) => r.fordUnlockId !== undefined);

describe.each(fordRegions)('ford shortcut invariants: %s', (_id, region) => {
  const map = gridFor(region);
  const fordUnlockId = region.fordUnlockId as string;
  const unlocked: ReadonlySet<string> = new Set([fordUnlockId]);
  const basePassable = passableFn(map, NO_UNLOCKS);
  const openPassable = passableFn(map, unlocked);

  function fordTiles(): PathNode[] {
    const tiles: PathNode[] = [];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const id = getTerrainIdAt(map, x, y);
        if (id !== undefined && getTerrain(id)?.unlockId === fordUnlockId) {
          tiles.push({ x, y });
        }
      }
    }
    return tiles;
  }

  it('has at least one ford tile keyed to its unlock id', () => {
    expect(fordTiles().length).toBeGreaterThan(0);
  });

  it('has a signpost on passable ground', () => {
    expect(region.signpost, `${region.id} has a ford but no signpost`).toBeDefined();
    const s = region.signpost!;
    expect(basePassable(s.x, s.y)).toBe(true);
  });

  it('keeps ford tiles blocked until unlocked, then passable', () => {
    for (const t of fordTiles()) {
      expect(basePassable(t.x, t.y), `ford tile (${t.x},${t.y}) should start blocked`).toBe(false);
      expect(openPassable(t.x, t.y), `ford tile (${t.x},${t.y}) should open on unlock`).toBe(true);
    }
  });

  it('opens a crossing strictly shorter than the detour it replaces', () => {
    // The banks are the passable tiles touching the ford crossing (which may be
    // several tiles wide, so gather neighbours across the whole ford group and
    // dedupe). With the ford locked those banks connect only by going around
    // (the bridge); with it open they connect straight through. At least one
    // bank pair must be strictly shorter through the ford, which is exactly what
    // "the ford is a real shortcut" means.
    const fords = fordTiles();
    const fordKeys = new Set(fords.map((f) => `${f.x},${f.y}`));
    const bankMap = new Map<string, PathNode>();
    for (const f of fords) {
      for (const d of ORTHOGONAL) {
        const n = { x: f.x + d.x, y: f.y + d.y };
        const nk = `${n.x},${n.y}`;
        if (!fordKeys.has(nk) && basePassable(n.x, n.y)) {
          bankMap.set(nk, n);
        }
      }
    }
    const banks = [...bankMap.values()];

    let proven = 0;
    for (let i = 0; i < banks.length; i++) {
      for (let j = i + 1; j < banks.length; j++) {
        const a = banks[i]!;
        const b = banks[j]!;
        const detour = route(map, a, b, NO_UNLOCKS);
        const viaFord = route(map, a, b, unlocked);
        if (detour.reachable && viaFord.reachable && viaFord.distance < detour.distance) {
          proven += 1;
        }
      }
    }
    expect(proven, `${region.id} ford does not shorten any crossing`).toBeGreaterThan(0);
  });
});
