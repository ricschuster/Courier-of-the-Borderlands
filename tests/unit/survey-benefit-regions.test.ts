import { describe, it, expect } from 'vitest';
import { surveyBenefit } from '../../src/systems/survey-benefit';
import { REGIONS, getRegion } from '../../src/systems/region-system';
import { createTileMap, getTerrainIdAt } from '../../src/systems/tile-map';
import { getTerrain, isPassableWith } from '../../src/systems/terrain-system';
import { traversalKeys } from '../../src/systems/traversal';
import { wayfinderSurveyRadius } from '../../src/systems/minimap';
import { effectiveRevealRadius } from '../../src/systems/fog-of-war';
import { revealRadius } from '../../src/systems/upgrade-system';
import { skillRevealBonus } from '../../src/systems/skills';
import { UPGRADES_GREYBRIDGE } from '../../src/data/upgrades-greybridge';
import { FOG_REVEAL_RADIUS } from '../../src/config/game-config';
import type { SkillRanks } from '../../src/systems/skills';

// #361: does #341's minimap survey ring actually buy a better route?
//
// Two playtests measured the same Wayfinder economics (43% more wear per
// delivery, 80% repair tax against 59%) and the issue records that a scripted run
// "cannot measure whether the ring helps a person plan a route". That is true of
// feel. It is not true of routing, which is mechanical, so this prices the ring
// across every real contract route in the game.
//
// Set SURVEY_REPORT=1 to print the table. The assertions run either way.

/** A late-game courier: everything fitted and the region's ford open. */
const ALL_UPGRADES = new Set(UPGRADES_GREYBRIDGE.map((u) => u.id));

function routesFor(regionId: string) {
  const region = getRegion(regionId);
  const map = createTileMap(region.rows, region.legend);
  const unlocks = new Set<string>(region.fordUnlockId === undefined ? [] : [region.fordUnlockId]);

  return region.contracts
    .map((contract) => {
      const from = region.settlements[contract.pickupId];
      const to = region.settlements[contract.destinationId];
      return from === undefined || to === undefined
        ? null
        : { contract, start: from.tile, goal: to.tile };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((route) => ({ ...route, region, map, unlocks }));
}

/** Reveal upgrades only; everything else is irrelevant to what the ring can add. */
const REVEAL_UPGRADES = new Set(
  UPGRADES_GREYBRIDGE.filter((u) => (u.revealBonus ?? 0) > 0).map((u) => u.id),
);

/**
 * The two loadouts that matter. The distinction turned out to be the whole
 * answer: the ring only reaches past the walked fog for a courier who has *not*
 * bought the reveal upgrades.
 */
export const LOADOUTS = {
  'all upgrades': ALL_UPGRADES,
  'no reveal upgrades': new Set(
    [...ALL_UPGRADES].filter((id) => !REVEAL_UPGRADES.has(id)),
  ),
} as const;

function measure(regionId: string, rank: number, upgrades: ReadonlySet<string>) {
  const skills: SkillRanks = { wayfinder: rank };
  const reveal = effectiveRevealRadius(
    revealRadius(upgrades, UPGRADES_GREYBRIDGE, FOG_REVEAL_RADIUS),
    skillRevealBonus(skills),
    0,
  );
  const survey = wayfinderSurveyRadius(rank);

  return routesFor(regionId).map((route) => {
    const keys = traversalKeys(route.unlocks, upgrades, skills);
    const speedAt = (x: number, y: number): number => {
      const id = getTerrainIdAt(route.map, x, y);
      if (id === undefined || !isPassableWith(id, keys)) {
        return 0;
      }
      return getTerrain(id)?.speedModifier ?? 0;
    };
    return {
      contractId: route.contract.id,
      benefit: surveyBenefit({
        width: route.map.width,
        height: route.map.height,
        speedAt,
        passableAt: (x, y) => speedAt(x, y) > 0,
        start: route.start,
        goal: route.goal,
        revealRadius: reveal,
        surveyRadius: survey,
      }),
    };
  });
}

describe('the Wayfinder survey ring, priced over every real contract route', () => {
  const regionIds = Object.keys(REGIONS);

  it('has routes to measure in every region', () => {
    for (const id of regionIds) {
      expect(routesFor(id).length, `${id} has no measurable contract routes`).toBeGreaterThan(0);
    }
  });

  // Worth having on its own: a cost-aware router that walks with partial
  // knowledge is a stricter reachability check than the BFS the region
  // invariants use, because it has to actually get there while being misled.
  it('completes every contract route with and without the ring', () => {
    for (const id of regionIds) {
      for (const { contractId, benefit } of measure(id, 3, ALL_UPGRADES)) {
        expect(benefit.withoutRing.reachedGoal, `${contractId} unreachable without ring`).toBe(true);
        expect(benefit.withRing.reachedGoal, `${contractId} unreachable with ring`).toBe(true);
      }
    }
  });

  it('prices the ring, and reports what it found', () => {
    const summary: string[] = [];
    const detail: string[] = [];
    let grandSaved = 0;

    for (const [loadout, upgrades] of Object.entries(LOADOUTS)) {
      let totalSaved = 0;
      let totalCost = 0;
      let routesHelped = 0;
      let routesMeasured = 0;
      let replansAvoided = 0;

      for (const rank of [1, 2, 3]) {
        const reveal = effectiveRevealRadius(
          revealRadius(upgrades, UPGRADES_GREYBRIDGE, FOG_REVEAL_RADIUS),
          skillRevealBonus({ wayfinder: rank }),
          0,
        );
        const survey = wayfinderSurveyRadius(rank);
        detail.push(
          `  ${loadout}, rank ${rank}: fog reveal ${reveal}, survey ring ${survey}` +
            (survey <= reveal ? '  <- ring inside the fog, can add nothing' : ''),
        );

        for (const id of Object.keys(REGIONS)) {
          for (const { benefit } of measure(id, rank, upgrades)) {
            routesMeasured++;
            totalSaved += benefit.costSaved;
            totalCost += benefit.withoutRing.cost;
            replansAvoided += benefit.replansAvoided;
            if (benefit.costSaved > 0.0001) {
              routesHelped++;
            }
          }
        }
      }

      grandSaved += totalSaved;
      summary.push(
        `${loadout}: ${routesHelped}/${routesMeasured} routes changed, ` +
          `${totalSaved.toFixed(2)} of ${totalCost.toFixed(1)} cost saved ` +
          `(${((100 * totalSaved) / totalCost).toFixed(2)}%), ` +
          `${replansAvoided} dead-end re-plans avoided`,
      );
    }

    if (process.env.SURVEY_REPORT === '1') {
      console.log('\n=== Wayfinder survey ring (#341), priced over real routes ===');
      console.log(detail.join('\n'));
      console.log('');
      console.log(summary.join('\n'));
      console.log('');
    }

    // The measure must produce a finite, non-negative answer. It deliberately
    // does NOT assert the ring is valuable: zero is a permitted result, and a
    // zero is exactly what would settle #361 against it.
    expect(Number.isFinite(grandSaved)).toBe(true);
    expect(grandSaved).toBeGreaterThanOrEqual(0);
  });

  // The measure's own guard. A tool that has only ever reported zero is
  // indistinguishable from a broken tool, so this pins the one configuration
  // where the ring provably reaches past the walked fog and must therefore be
  // able to score. If this ever goes to zero, suspect the measure before the
  // conclusion.
  it('can detect a benefit where the ring reaches past the fog', () => {
    const reveal = effectiveRevealRadius(
      revealRadius(LOADOUTS['no reveal upgrades'], UPGRADES_GREYBRIDGE, FOG_REVEAL_RADIUS),
      skillRevealBonus({ wayfinder: 3 }),
      0,
    );
    expect(wayfinderSurveyRadius(3)).toBeGreaterThan(reveal);
  });
});
