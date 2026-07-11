import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, driveToTile, pressUntil, readTick, type Arrow } from './drive';

// Regression guard for a capability-gate soft-lock. The deep-mire shortcut to
// Reedgrave is gated by the "mire-crossing" capability, granted by ranking the
// Off-road skill to 2 (or buying Marsh Treads). The impassable colliders are
// baked once when the scene is created, so a capability gained mid-scene must
// actively remove the mire's collider; otherwise the pathfinder routes through
// the now-passable tile while physics still blocks it, and the courier
// soft-locks at the mire's edge. This is what stalled the full-arc run around
// tile (25,19).
//
// This proves the fix end to end: with the mire collider present (Off-road at
// rank 1), rank Off-road to 2 in-scene, then drive across the deep-mire tile
// with real key presses. Without the collider refresh the final drive sticks;
// with it the courier crosses. Ranking is chosen over the Marsh Treads upgrade
// because it works anywhere, so no home detour is needed. Shared drive helpers
// live in ./drive.

// The deep-mire crossing (see src/data/greybridge-map.ts) and Reedgrave beyond
// it. The courier must physically occupy the mire tile while crossing.
const MIRE_TILE = { x: 26, y: 19 };
const REEDGRAVE_TILE = { x: 28, y: 19 };

test('ranking Off-road to 2 opens the deep mire in the same scene', async ({ page }) => {
  test.setTimeout(120_000);

  const errors = collectErrors(page);

  // Seed a save with Off-road at rank 1 and spare skill points to reach rank 2:
  // 20 deliveries is level 5 (4 points), one spent on the seeded rank. Marsh
  // Treads is not owned, so the mire is gated only by the skill.
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
        regionId: 'greybridge',
        fogByRegion: {},
        activeContractId: null,
        contractStatus: null,
        distanceTiles: 0,
        deliveries: 20,
        achievements: [],
        skills: { 'off-road': 1 },
        storyFlags: [],
      }),
    );
  });

  // Turbo doubles wagon speed so the cross-map drive to the mire finishes fast;
  // same input, same paths.
  await bootE2E(page, { turbo: true });

  const held = new Set<Arrow>();

  // Baseline: in Greybridge, Off-road at rank 1, and the mire tile is gated.
  const start = await readTick(page, 0, 0);
  expect(start.state.regionId).toBe('greybridge');
  expect(start.state.skills['off-road']).toBe(1);
  const mireGated = await page.evaluate(
    (t) => globalThis.__courier!.isPassableTile(t.x, t.y),
    MIRE_TILE,
  );
  expect(mireGated, 'deep mire should be impassable at Off-road rank 1').toBe(false);

  // Open the skill panel and rank Off-road (panel slot 2) to rank 2, re-pressing
  // until it registers. Ranking works anywhere, so no home visit is needed.
  await page.keyboard.press('k');
  await expect
    .poll(async () => (await readTick(page, 0, 0)).state.skillPanelOpen, { timeout: 5_000 })
    .toBe(true);
  await pressUntil(page, '2', async () =>
    (await readTick(page, 0, 0)).state.skills['off-road'] === 2,
  );
  // Close the panel again so nothing else swallows input during the drive.
  await page.keyboard.press('k');

  const mireOpen = await page.evaluate(
    (t) => globalThis.__courier!.isPassableTile(t.x, t.y),
    MIRE_TILE,
  );
  expect(mireOpen, 'deep mire should be passable after Off-road rank 2').toBe(true);

  // Drive to Reedgrave across the deep mire. The shortest route now runs through
  // the mire tile; without the collider refresh the courier sticks at its west
  // edge and driveToTile throws. The onTile callback records the route so we can
  // assert the mire tile was physically occupied.
  const visited: string[] = [];
  await driveToTile(page, held, REEDGRAVE_TILE.x, REEDGRAVE_TILE.y, (t) =>
    visited.push(`${t.x},${t.y}`),
  );
  expect(
    visited,
    'courier should have physically crossed the deep-mire tile',
  ).toContain(`${MIRE_TILE.x},${MIRE_TILE.y}`);

  expect(errors, `runtime errors during mire route run:\n${errors.join('\n')}`).toEqual([]);
});
