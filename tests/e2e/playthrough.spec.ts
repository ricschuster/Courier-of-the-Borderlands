import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, driveToTile, pressUntil, readTick, type Arrow } from './drive';

// Input-driven playthrough: boot the real built game, then drive the courier
// with genuine key presses through a full delivery loop (reach the home town,
// accept a contract, drive to the destination, complete the delivery) and
// assert the rewards land. Navigation targets come from the game's own
// pathfinding via the `?e2e` debug hook, but all movement is real keyboard
// input flowing through Phaser, so this exercises the same path a player would.
// Shared drive helpers live in ./drive.

test('drives a full delivery loop with real key presses', async ({ page }) => {
  test.setTimeout(90_000);

  const errors = collectErrors(page);

  // The `?e2e` flag tells the scene to attach the read-plus-navigate hook.
  await bootE2E(page);

  const held = new Set<Arrow>();

  // Baseline: fresh game, nothing delivered, no active contract.
  const start = await readTick(page, 0, 0);
  expect(start.state.regionId).toBe('greybridge');
  expect(start.state.deliveries).toBe(0);
  expect(start.state.activeContractId).toBeNull();
  const startingFog = start.state.fogRevealed;

  // 1. Drive to the home town so the contract board is reachable.
  const home = start.state.home;
  await driveToTile(page, held, home.tileX, home.tileY);
  const atHome = await readTick(page, home.tileX, home.tileY);
  expect(atHome.state.atHome).toBe(true);
  // The first Greybridge contract requires no reputation, so it must be offered.
  expect(atHome.state.availableContractIds).toContain('letters-to-eastwatch');

  // 2. Accept the first contract with a real key press ("1"), re-pressing until
  //    it registers (a single press can be dropped under CI load). Cargo is
  //    picked up automatically in the home town, so status becomes "carrying".
  await pressUntil(
    page,
    '1',
    async () =>
      (await readTick(page, home.tileX, home.tileY)).state.activeContractId ===
      'letters-to-eastwatch',
  );
  const accepted = await readTick(page, home.tileX, home.tileY);
  expect(accepted.state.contractStatus).toBe('carrying');
  expect(accepted.state.destination).not.toBeNull();

  // Eastwatch is silent before its delivery: the world has not reacted yet.
  expect(accepted.state.worldState.eastwatch).toBe('silent');

  // 3. Drive to the delivery destination.
  const dest = accepted.state.destination!;
  await driveToTile(page, held, dest.tileX, dest.tileY);

  // 4. The delivery completes on arrival; wait for the reward to land.
  await expect
    .poll(async () => (await readTick(page, dest.tileX, dest.tileY)).state.deliveries, {
      timeout: 5_000,
    })
    .toBe(1);
  const done = await readTick(page, dest.tileX, dest.tileY);
  expect(done.state.delivered).toBe(1);
  expect(done.state.activeContractId).toBeNull();
  // World-state reacts: the delivery reconnects Eastwatch. This is the payoff
  // the playtest found missing (docs/design/05_playtest_notes.md).
  expect(done.state.worldState.eastwatch).toBe('reconnected');
  // The home town is always home; a still-undelivered place stays silent.
  expect(done.state.worldState.greywater).toBe('home');
  expect(done.state.worldState.southmill).toBe('silent');
  // The contract pays a fixed +2 reputation and a positive coin reward.
  expect(done.state.reputation).toBe(2);
  expect(done.state.coins).toBeGreaterThan(0);
  // Driving across the map must have revealed more fog than the spawn reveal.
  expect(done.state.fogRevealed).toBeGreaterThan(startingFog);

  // 5. The completed delivery must persist to the save.
  const save = await page.evaluate(() =>
    localStorage.getItem('courier-of-the-borderlands/save'),
  );
  const parsed = JSON.parse(save ?? '{}');
  expect(parsed.completed).toContain('letters-to-eastwatch');
  expect(parsed.deliveries).toBe(1);

  // No runtime errors during the whole playthrough.
  expect(errors, `runtime errors during playthrough:\n${errors.join('\n')}`).toEqual([]);
});

test('unlocks the southern ford by driving to the signpost', async ({ page }) => {
  test.setTimeout(90_000);

  const errors = collectErrors(page);

  await bootE2E(page);

  const held = new Set<Arrow>();

  // Baseline: the ford route starts locked and the signpost that opens it exists.
  const start = await readTick(page, 0, 0);
  expect(start.state.regionId).toBe('greybridge');
  expect(start.state.fordUnlocked).toBe(false);
  expect(start.state.unlocks).not.toContain('ford-crossing-greybridge');
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
  // ford tile becomes drivable, so a new southern crossing has opened.
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

  // The unlock must persist to the save.
  const save = await page.evaluate(() =>
    localStorage.getItem('courier-of-the-borderlands/save'),
  );
  const parsed = JSON.parse(save ?? '{}');
  expect(parsed.unlocks).toContain('ford-crossing-greybridge');

  expect(errors, `runtime errors during unlock run:\n${errors.join('\n')}`).toEqual([]);
});
