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

/** Every tile whose terrain is gated by exactly `unlockId`. */
function tilesWithUnlock(map: TileMap, unlockId: string): PathNode[] {
  const tiles: PathNode[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const id = getTerrainIdAt(map, x, y);
      if (id !== undefined && getTerrain(id)?.unlockId === unlockId) {
        tiles.push({ x, y });
      }
    }
  }
  return tiles;
}

/**
 * Count the bank pairs a gated crossing genuinely shortens. The banks are the
 * base-passable tiles touching the gated group (which may be several tiles
 * wide, so gather neighbours across the whole group and dedupe). With the gate
 * locked those banks connect only by going around; with the gating capability
 * held they can connect straight through. A pair is "proven" when both routes
 * exist and the capability route is strictly shorter, which is exactly what
 * "this gate is a real shortcut, not the only way" means. Shared by the ford
 * (unlock-flag) and capability (upgrade/skill) gate suites.
 */
function shorterCrossings(
  map: TileMap,
  gatedTiles: readonly PathNode[],
  unlocked: ReadonlySet<string>,
): number {
  const basePassable = passableFn(map, NO_UNLOCKS);
  const gatedKeys = new Set(gatedTiles.map((t) => `${t.x},${t.y}`));
  const bankMap = new Map<string, PathNode>();
  for (const f of gatedTiles) {
    for (const d of ORTHOGONAL) {
      const n = { x: f.x + d.x, y: f.y + d.y };
      const nk = `${n.x},${n.y}`;
      if (!gatedKeys.has(nk) && basePassable(n.x, n.y)) {
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
      const viaGate = route(map, a, b, unlocked);
      if (detour.reachable && viaGate.reachable && viaGate.distance < detour.distance) {
        proven += 1;
      }
    }
  }
  return proven;
}

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

  const fordTiles = (): PathNode[] => tilesWithUnlock(map, fordUnlockId);

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
    const proven = shorterCrossings(map, fordTiles(), unlocked);
    expect(proven, `${region.id} ford does not shorten any crossing`).toBeGreaterThan(0);
  });
});

// Capability-gated shortcuts (deep-mire, tidal-flats). Unlike fords, these open
// on a purchased upgrade or a skill rank rather than a one-off unlock flag, and
// their gating token (mire-crossing, tidal-crossing) is passed straight to the
// passability rule. Per-region pocket tests check specific settlement pairs by
// hand; this promotes that to a data-driven guard that auto-discovers every
// capability gate in every region, so a new gated tile or region is covered the
// moment it is authored. Ford gates are excluded here (covered above).
const capabilityGates = regionEntries.flatMap(([, region]) => {
  const map = gridFor(region);
  const tokens = new Set<string>();
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const id = getTerrainIdAt(map, x, y);
      const token = id === undefined ? undefined : getTerrain(id)?.unlockId;
      if (token !== undefined && token !== region.fordUnlockId) {
        tokens.add(token);
      }
    }
  }
  return [...tokens].map((token) => ({ region, token, label: `${region.id} / ${token}` }));
});

describe.each(capabilityGates)('capability-gated shortcut invariants: $label', ({ region, token }) => {
  const map = gridFor(region);
  const held: ReadonlySet<string> = new Set([token]);
  const basePassable = passableFn(map, NO_UNLOCKS);
  const heldPassable = passableFn(map, held);
  const gatedTiles = tilesWithUnlock(map, token);

  it('has at least one tile keyed to the capability token', () => {
    expect(gatedTiles.length).toBeGreaterThan(0);
  });

  it('keeps gated tiles blocked until the capability is held, then passable', () => {
    for (const t of gatedTiles) {
      expect(basePassable(t.x, t.y), `gated tile (${t.x},${t.y}) should start blocked`).toBe(false);
      expect(
        heldPassable(t.x, t.y),
        `gated tile (${t.x},${t.y}) should open with ${token}`,
      ).toBe(true);
    }
  });

  it('opens a crossing strictly shorter than the detour it replaces', () => {
    const proven = shorterCrossings(map, gatedTiles, held);
    expect(proven, `${region.id} ${token} does not shorten any crossing`).toBeGreaterThan(0);
  });
});
