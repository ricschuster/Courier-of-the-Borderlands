import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, driveToTile, readTick, type Arrow } from './drive';

// Input-driven e2e proof that unlocking the Greybridge ford actually changes
// the game's own pathfinding, not just a flag. Before the unlock, the shortest
// path to a tile on the east bank must detour north to the bridge (the only
// open crossing). After reaching the signpost and unlocking the ford, the same
// path must route through the ford tile and be strictly shorter. Finally we
// drive the courier across the ford with real key presses to prove it is
// physically crossable, not just marked passable. Shared drive helpers live in
// ./drive.

test('unlocked ford shortens the pathfinding route and is drivable', async ({ page }) => {
  test.setTimeout(90_000);

  const errors = collectErrors(page);

  await bootE2E(page);

  const held = new Set<Arrow>();

  // Baseline: ford route starts locked, signpost that opens it exists.
  const start = await readTick(page, 0, 0);
  expect(start.state.regionId).toBe('greybridge');
  expect(start.state.fordUnlocked).toBe(false);
  expect(start.state.signpost).not.toBeNull();
  const signpost = start.state.signpost!;

  // The ford tile is just east of the signpost on the same row.
  const fordTileX = signpost.tileX + 1;
  const fordTileY = signpost.tileY;

  const fordBlocked = await page.evaluate(
    (t) => globalThis.__courier!.isPassableTile(t.x, t.y),
    { x: fordTileX, y: fordTileY },
  );
  expect(fordBlocked, 'ford should be impassable before the unlock').toBe(false);

  // Drive to a west-bank tile on the ford's row, two tiles clear of the
  // signpost so this leg does not trip the unlock and the ford stays locked.
  const westStartX = signpost.tileX - 2;
  const westStartY = signpost.tileY;
  await driveToTile(page, held, westStartX, westStartY);

  // Goal on the east bank of the ford, just past the two-tile crossing and on
  // the ford's row, so the ford is the short way there and the bridge the long.
  const eastGoalX = signpost.tileX + 3;
  const eastGoalY = signpost.tileY;

  // Pre-unlock route must detour north to the row-5 bridge, since the ford is
  // still blocked and it is the only other crossing.
  const before = await page.evaluate(
    (g) => globalThis.__courier!.pathTo(g.x, g.y),
    { x: eastGoalX, y: eastGoalY },
  );
  expect(before, 'a route to the east bank must exist via the bridge').not.toBeNull();
  expect(
    before!.some((t) => t.x === fordTileX && t.y === fordTileY),
    'pre-unlock route must not use the still-locked ford',
  ).toBe(false);

  // Drive to the signpost. Reaching it fires the unlock overlap.
  await driveToTile(page, held, signpost.tileX, signpost.tileY);

  await expect
    .poll(async () => (await readTick(page, 0, 0)).state.fordUnlocked, { timeout: 5_000 })
    .toBe(true);
  const unlocked = await readTick(page, 0, 0);
  expect(unlocked.state.unlocks).toContain('ford-crossing-greybridge');
  const fordOpen = await page.evaluate(
    (t) => globalThis.__courier!.isPassableTile(t.x, t.y),
    { x: fordTileX, y: fordTileY },
  );
  expect(fordOpen, 'ford should be passable after the unlock').toBe(true);

  // Post-unlock route must use the ford and be strictly shorter than the
  // pre-unlock detour over the bridge.
  const after = await page.evaluate(
    (g) => globalThis.__courier!.pathTo(g.x, g.y),
    { x: eastGoalX, y: eastGoalY },
  );
  expect(after, 'a route to the east bank must exist via the ford').not.toBeNull();
  expect(
    after!.some((t) => t.x === fordTileX && t.y === fordTileY),
    'post-unlock route must cross the newly opened ford',
  ).toBe(true);
  expect(
    after!.length,
    'the ford should give a shorter southern route than the bridge detour',
  ).toBeLessThan(before!.length);

  // Drive across the ford for real, proving it is not just marked passable.
  const visited: string[] = [];
  await driveToTile(page, held, eastGoalX, eastGoalY, (t) => visited.push(`${t.x},${t.y}`));
  expect(
    visited,
    'courier should have physically occupied the ford tile while crossing',
  ).toContain(`${fordTileX},${fordTileY}`);

  expect(errors, `runtime errors during ford route run:\n${errors.join('\n')}`).toEqual([]);
});
