import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, driveToTile, pressUntil, readTick, type Arrow } from './drive';

// Regression guard for the Saltreach tidal-flat gate. The lagoon-ringed hamlet
// of Saltmere is walled off by a salt lagoon (column 18); a single tidal-flat
// tile at (18,9) is the short way across, gated on the "tidal-crossing"
// capability (Salt Runners, or Off-road rank 3). This proves the gate end to
// end: with Off-road at rank 2 (which opens the mire but not the flats), rank
// it to 3 in-scene, then drive across the tidal flat with real key presses.
//
// It also guards that the mid-scene collider refresh (see the fix in map-scene
// refreshGatedColliders) covers this new gate: without it the pathfinder would
// route through the now-passable flat while a stale collider still blocked it,
// sticking the courier at the lagoon's edge. Shared drive helpers live in
// ./drive.

// The tidal-flat crossing and Saltmere beyond it (see region-saltreach.ts).
const TIDAL_TILE = { x: 18, y: 9 };
const SALTMERE_TILE = { x: 19, y: 9 };

test('ranking Off-road to 3 opens the tidal flats in the same scene', async ({ page }) => {
  test.setTimeout(120_000);

  const errors = collectErrors(page);

  // Seed a Saltreach save with Off-road at rank 2 (mire yes, flats no) and spare
  // skill points to reach rank 3: 20 deliveries is level 5 (4 points), two spent
  // on the seeded rank. Salt Runners is not owned, so the flats are gated only
  // by the skill.
  await page.addInitScript(() => {
    localStorage.setItem(
      'courier-of-the-borderlands/save',
      JSON.stringify({
        version: 1,
        coins: 0,
        reputation: {},
        unlocks: [],
        upgrades: [],
        completed: [],
        visited: [],
        regionId: 'saltreach',
        fogByRegion: {},
        activeContractId: null,
        contractStatus: null,
        distanceTiles: 0,
        deliveries: 20,
        achievements: [],
        skills: { 'off-road': 2 },
        storyFlags: [],
      }),
    );
  });

  await bootE2E(page, { turbo: true });

  const held = new Set<Arrow>();

  // Baseline: in Saltreach, Off-road at rank 2, and the tidal tile is gated.
  const start = await readTick(page, 0, 0);
  expect(start.state.regionId).toBe('saltreach');
  expect(start.state.skills['off-road']).toBe(2);
  const flatsGated = await page.evaluate(
    (t) => globalThis.__courier!.isPassableTile(t.x, t.y),
    TIDAL_TILE,
  );
  expect(flatsGated, 'tidal flat should be impassable at Off-road rank 2').toBe(false);

  // Open the skill panel and rank Off-road (panel slot 2) to rank 3, re-pressing
  // until it registers. Ranking works anywhere, so no home visit is needed.
  await page.keyboard.press('k');
  await expect
    .poll(async () => (await readTick(page, 0, 0)).state.skillPanelOpen, { timeout: 5_000 })
    .toBe(true);
  await pressUntil(page, '2', async () =>
    (await readTick(page, 0, 0)).state.skills['off-road'] === 3,
  );
  await page.keyboard.press('k');

  const flatsOpen = await page.evaluate(
    (t) => globalThis.__courier!.isPassableTile(t.x, t.y),
    TIDAL_TILE,
  );
  expect(flatsOpen, 'tidal flat should be passable after Off-road rank 3').toBe(true);

  // Drive to Saltmere across the tidal flat. The shortest route now runs through
  // the flat; without the collider refresh the courier sticks at the lagoon's
  // west edge and driveToTile throws. The onTile callback records the route so
  // we can assert the flat was physically occupied.
  const visited: string[] = [];
  await driveToTile(page, held, SALTMERE_TILE.x, SALTMERE_TILE.y, (t) =>
    visited.push(`${t.x},${t.y}`),
  );
  expect(
    visited,
    'courier should have physically crossed the tidal-flat tile',
  ).toContain(`${TIDAL_TILE.x},${TIDAL_TILE.y}`);

  expect(errors, `runtime errors during tidal route run:\n${errors.join('\n')}`).toEqual([]);
});
