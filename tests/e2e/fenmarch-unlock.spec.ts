import { test, expect } from '@playwright/test';
import { collectErrors, driveToTile, readTick, type Arrow } from './drive';

// Input-driven unlock test for the Fenmarch region, mirroring the Greybridge
// ford-unlock test in playthrough.spec.ts. Fenmarch is not the default region,
// so this test seeds a save pointing at it before boot instead of using
// bootE2E (which always boots Greybridge with no save).

test('unlocks the Fenmarch ford by driving to the signpost', async ({ page }) => {
  test.setTimeout(90_000);

  const errors = collectErrors(page);

  // Seed a save pointing at the Fenmarch region before the game boots.
  await page.addInitScript(() => {
    localStorage.setItem(
      'courier-of-the-borderlands/save',
      JSON.stringify({
        version: 1,
        coins: 100,
        reputation: {},
        unlocks: [],
        upgrades: [],
        completed: [],
        visited: [],
        regionId: 'fenmarch',
        fogByRegion: {},
        activeContractId: null,
        contractStatus: null,
        distanceTiles: 0,
        deliveries: 0,
        achievements: [],
      }),
    );
  });

  await page.goto('./play.html?e2e=1');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  // Focus the canvas so key events reach the game.
  await page.locator('#game canvas').click();
  await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, {
    timeout: 15_000,
  });

  const held = new Set<Arrow>();

  // Baseline: the ford route starts locked and the signpost that opens it exists.
  const start = await readTick(page, 0, 0);
  expect(start.state.regionId).toBe('fenmarch');
  expect(start.state.fordUnlocked).toBe(false);
  expect(start.state.unlocks).not.toContain('ford-crossing-fenmarch');
  expect(start.state.signpost).not.toBeNull();
  const signpost = start.state.signpost!;

  // The ford tile just east of the signpost must be blocked before the unlock.
  const fordTileX = signpost.tileX + 1;
  const fordTileY = signpost.tileY;
  const fordBlocked = await page.evaluate(
    (t) => globalThis.__courier!.isPassableTile(t.x, t.y),
    { x: fordTileX, y: fordTileY },
  );
  expect(fordBlocked, 'ford should be impassable before the unlock').toBe(false);

  // Drive to the signpost. Reaching it fires the unlock overlap.
  await driveToTile(page, held, signpost.tileX, signpost.tileY);

  // The route unlock lands: ford flag flips, the unlock id is recorded, and the
  // ford tile becomes drivable, so a new eastern crossing has opened.
  await expect
    .poll(async () => (await readTick(page, 0, 0)).state.fordUnlocked, { timeout: 5_000 })
    .toBe(true);
  const unlocked = await readTick(page, 0, 0);
  expect(unlocked.state.unlocks).toContain('ford-crossing-fenmarch');
  const fordOpen = await page.evaluate(
    (t) => globalThis.__courier!.isPassableTile(t.x, t.y),
    { x: fordTileX, y: fordTileY },
  );
  expect(fordOpen, 'ford should be passable after the unlock').toBe(true);

  // The unlock must persist to the save.
  const save = await page.evaluate(() =>
    localStorage.getItem('courier-of-the-borderlands/save'),
  );
  const parsed = JSON.parse(save ?? '{}');
  expect(parsed.unlocks).toContain('ford-crossing-fenmarch');

  expect(errors, `runtime errors during unlock run:\n${errors.join('\n')}`).toEqual([]);
});
