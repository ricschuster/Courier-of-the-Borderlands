import { describe, it, expect } from 'vitest';
import { REGIONS, getRegion, type Region } from '../../src/systems/region-system';
import { createTileMap, getTerrainIdAt, type TileMap } from '../../src/systems/tile-map';
import { getTerrain, isPassableWith, getWearSpeedModifier } from '../../src/systems/terrain-system';
import { traversalKeys } from '../../src/systems/traversal';
import { countReliefUpgrades, terrainSpeedFactor } from '../../src/systems/upgrade-system';
import { UPGRADES_GREYBRIDGE } from '../../src/data/upgrades-greybridge';
import {
  DEFAULT_WAGON_TUNING,
  maxConditionForLevel,
  wearPerTile,
} from '../../src/systems/wagon-condition';
import { type SkillRanks } from '../../src/systems/skills';

// What a journey costs the wagon, priced over every real route in the game
// (slice 5 of docs/design/10_open_world_expansion.md).
//
// The travel-sink e2e (tests/e2e/travel-sink-measure.spec.ts) answers "how did
// one whole arc go" for one build. This answers the tuning question that #436
// and #412 actually ask, which the arc run cannot: for a GIVEN build, what does
// each leg cost, and what does one more coin or one more skill point buy?
//
// It is the static counterpart, so it is fast, deterministic, and prices builds
// no scripted arc would ever play (a bare level-1 wagon walking into Fenmarch).
//
// Set WEAR_REPORT=1 to print the tables. The assertions run either way.
//
//   npm run measure:wear
//
// Caveats when reading the numbers. Both push the same way, so treat these as a
// floor on what a person pays:
//   - routes are time-optimal with full map knowledge; a real courier drives
//     under fog and wanders
//   - a leg is one way, from the region's home settlement

const ALL_UPGRADES = new Set(UPGRADES_GREYBRIDGE.map((u) => u.id));
const RELIEF_UPGRADES = UPGRADES_GREYBRIDGE.filter((u) => (u.roughnessRelief ?? 0) > 0).map(
  (u) => u.id,
);

/** A build is what the courier has bought and ranked: the two spend currencies. */
interface Build {
  readonly label: string;
  readonly upgrades: ReadonlySet<string>;
  readonly skills: SkillRanks;
}

function build(label: string, upgrades: readonly string[], skills: SkillRanks = {}): Build {
  return { label, upgrades: new Set(upgrades), skills };
}

/**
 * The builds worth pricing. The pairs are the point: 'axle' against 'off-road 1'
 * is 60 coins against one skill point, and 'treads' against 'off-road 2' is the
 * substitution #412 is about (same route opened, one paid for in coins).
 */
export const BUILDS: readonly Build[] = [
  build('bare', []),
  build('axle', ['sprung-axle']),
  build('axle+treads', ['sprung-axle', 'marsh-treads']),
  build('all relief', RELIEF_UPGRADES),
  build('off-road 1', [], { 'off-road': 1 }),
  build('off-road 2', [], { 'off-road': 2 }),
  build('off-road 3', [], { 'off-road': 3 }),
  build('everything', [...ALL_UPGRADES], { 'off-road': 3 }),
];

interface Leg {
  readonly to: string;
  /** Condition points spent driving the route one way. */
  readonly wear: number;
  readonly tiles: number;
  readonly reachable: boolean;
}

/**
 * Cheapest route from start to goal by travel TIME (Dijkstra over 1/speed),
 * then the wear that route costs. Time is what a player optimises for, so
 * pricing the wear of the fast route is the honest number; a wear-optimal route
 * would flatter the tuning by assuming a player who plans around the sink.
 */
function driveCost(
  map: TileMap,
  region: Region,
  b: Build,
  start: { x: number; y: number },
  goal: { x: number; y: number },
): { wear: number; tiles: number; reachable: boolean } {
  const keys = traversalKeys(
    new Set<string>(), // fords closed: a leg is priced on the route that always exists
    b.upgrades,
    b.skills,
  );
  const relief = countReliefUpgrades(b.upgrades, UPGRADES_GREYBRIDGE);

  const size = map.width * map.height;
  const at = (x: number, y: number): { speed: number; wear: number } | null => {
    const id = getTerrainIdAt(map, x, y);
    if (id === undefined || !isPassableWith(id, keys)) return null;
    const terrain = getTerrain(id);
    if (terrain === undefined) return null;
    return {
      speed: terrainSpeedFactor(terrain.speedModifier, b.upgrades, UPGRADES_GREYBRIDGE),
      wear: wearPerTile(
        getWearSpeedModifier(id),
        relief,
        DEFAULT_WAGON_TUNING,
        region.wearMultiplier ?? 1,
      ),
    };
  };

  const time = new Float64Array(size).fill(Number.POSITIVE_INFINITY);
  const wear = new Float64Array(size).fill(0);
  const tiles = new Int32Array(size).fill(0);
  const done = new Uint8Array(size);
  const index = (x: number, y: number) => y * map.width + x;
  time[index(start.x, start.y)] = 0;

  // Small maps (about 700 tiles), so a linear scan for the frontier minimum is
  // simpler than a heap and fast enough.
  for (;;) {
    let best = -1;
    let bestTime = Number.POSITIVE_INFINITY;
    for (let i = 0; i < size; i++) {
      if (done[i] === 0 && time[i]! < bestTime) {
        best = i;
        bestTime = time[i]!;
      }
    }
    if (best === -1) break;
    done[best] = 1;
    const x = best % map.width;
    const y = Math.floor(best / map.width);
    if (x === goal.x && y === goal.y) {
      return { wear: wear[best]!, tiles: tiles[best]!, reachable: true };
    }
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const cell = at(nx, ny);
      if (cell === null || cell.speed <= 0) continue;
      const ni = index(nx, ny);
      const next = bestTime + 1 / cell.speed;
      if (next < time[ni]!) {
        time[ni] = next;
        wear[ni] = wear[best]! + cell.wear;
        tiles[ni] = tiles[best]! + 1;
      }
    }
  }
  return { wear: 0, tiles: 0, reachable: false };
}

/** Every home-to-settlement leg in a region, priced for one build. */
function legsFor(regionId: string, b: Build): Leg[] {
  const region = getRegion(regionId);
  const map = createTileMap(region.rows, region.legend);
  const home = region.settlements[region.home];
  if (home === undefined) return [];
  return Object.values(region.settlements)
    .filter((s) => s.id !== region.home)
    .map((s) => ({ to: s.id, ...driveCost(map, region, b, home.tile, s.tile) }));
}

const REPORT = process.env.WEAR_REPORT === '1';

// Each test routes every build over every leg of every region, which is fast
// bare (~0.3s) and several times that under `--coverage`, whose instrumentation
// roughly octuples this kind of work. That is what put the survey report past
// vitest's 5s default in CI's `check` job while it stayed green locally, so
// these carry explicit timeouts for the same reason: real long-running analysis
// gets room, and the rest of the suite keeps the tight default so a genuine hang
// still fails fast.
const ROUTING_TIMEOUT_MS = 60_000;

function report(lines: string[]): void {
  if (REPORT) console.log('\n' + lines.join('\n') + '\n');
}

describe('travel-sink wear, priced over every home-to-settlement leg', () => {
  const regionIds = Object.keys(REGIONS);

  it('prices every leg in every region for every build', () => {
    const lines: string[] = ['=== WEAR PER LEG (standard tuning, fords closed, one way) ==='];
    const tank1 = maxConditionForLevel(1);
    lines.push(`level-1 tank: ${tank1} points. Cells are wear (percent of that tank).`);

    for (const regionId of regionIds) {
      const region = getRegion(regionId);
      const rows = BUILDS.map((b) => ({ b, legs: legsFor(regionId, b) }));
      const names = rows[0]!.legs.map((l) => l.to);
      lines.push(`\n${region.name} (wearMultiplier ${region.wearMultiplier ?? 1}):`);
      lines.push(`  ${'build'.padEnd(13)}${names.map((n) => n.padStart(16)).join('')}`);
      for (const { b, legs } of rows) {
        const cells = legs.map((l) =>
          (l.reachable ? `${l.wear.toFixed(1)} (${Math.round((l.wear / tank1) * 100)}%)` : 'blocked')
            .padStart(16),
        );
        lines.push(`  ${b.label.padEnd(13)}${cells.join('')}`);
      }
      for (const { b, legs } of rows) {
        expect(legs.length, `${regionId} has no legs to price`).toBeGreaterThan(0);
        for (const leg of legs) {
          expect(leg.reachable, `${regionId}: ${b.label} cannot reach ${leg.to}`).toBe(true);
          expect(leg.wear, `${regionId}: ${b.label} -> ${leg.to} wears nothing`).toBeGreaterThan(0);
        }
      }
    }
    report(lines);
  }, ROUTING_TIMEOUT_MS);

  it('makes the first region ask a level-1 courier for a purchase (#436)', () => {
    // The spend gate #362 opened and #434 reopened. It is not a lock: every
    // road leg out of the hub stays cheap, so the world is enterable
    // everywhere. It is the wilds that ask.
    const tank = maxConditionForLevel(1);
    const bare = legsFor('greybridge', BUILDS[0]!);
    const worst = Math.max(...bare.map((l) => l.wear));

    // Over half a tank one way, so the courier who drives into the reeds on a
    // bare wagon cannot get back without repairing, and cannot repair without
    // earning. That is the pressure; nothing refuses them the trip.
    expect(worst / tank, 'the hub wilds no longer threaten a level-1 wagon').toBeGreaterThan(0.5);

    // And the relief upgrades are the answer to it: fitted, the same leg is a
    // round trip a level-1 tank can take.
    const kitted = legsFor('greybridge', BUILDS[2]!); // axle + treads, 150 coins
    expect(Math.max(...kitted.map((l) => l.wear)) / tank).toBeLessThan(0.25);
  }, ROUTING_TIMEOUT_MS);

  it('prices what one more coin or one more skill point buys', () => {
    const lines: string[] = ['=== WHAT A PURCHASE BUYS (total wear over all legs, all regions) ==='];
    const totals = new Map<string, number>();
    for (const b of BUILDS) {
      let total = 0;
      for (const regionId of regionIds) {
        for (const leg of legsFor(regionId, b)) total += leg.wear;
      }
      totals.set(b.label, total);
    }
    const bare = totals.get('bare')!;
    for (const b of BUILDS) {
      const total = totals.get(b.label)!;
      lines.push(
        `  ${b.label.padEnd(13)} ${total.toFixed(0).padStart(6)}  ` +
          `(${(((total - bare) / bare) * 100).toFixed(1)}% vs bare)`,
      );
    }
    report(lines);

    // Coins buy durability. Every relief upgrade cuts the wear bill, and the
    // full kit is the strongest answer in the game.
    expect(totals.get('axle')!, 'one relief upgrade does not reduce wear').toBeLessThan(bare);
    expect(totals.get('axle+treads')!).toBeLessThan(totals.get('axle')!);
    expect(totals.get('all relief')!).toBeLessThan(totals.get('axle+treads')!);

    // Points do not (#412). A skill point cannot buy what a coin buys, so
    // Off-road rank 1, which grants no crossing, leaves the wear bill exactly
    // where it was. Ranks 2 and 3 still lower it, but only by opening shorter
    // routes, which is access rather than durability.
    expect(totals.get('off-road 1')!, 'Off-road rank 1 changed the wear bill').toBeCloseTo(bare, 5);
    expect(totals.get('off-road 2')!).toBeLessThan(bare);
    expect(totals.get('off-road 3')!).toBeLessThan(totals.get('off-road 2')!);

    // The point of the pair: three skill points must not out-buy 290 coins of
    // relief upgrades. This is the substitution slice 5 closed, pinned so a
    // later tuning pass cannot reopen it unnoticed.
    expect(
      totals.get('all relief')!,
      'three skill points still substitute for the relief upgrades',
    ).toBeLessThan(totals.get('off-road 3')!);
  }, ROUTING_TIMEOUT_MS);
});
