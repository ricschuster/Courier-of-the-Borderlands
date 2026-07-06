import { test, expect, type Page } from '@playwright/test';

// Input-driven playthrough: boot the real built game, then drive the courier
// with genuine key presses through a full delivery loop (reach the home town,
// accept a contract, drive to the destination, complete the delivery) and
// assert the rewards land. Navigation targets come from the game's own
// pathfinding via the `?e2e` debug hook, but all movement is real keyboard
// input flowing through Phaser, so this exercises the same path a player would.

// A single tile is 48px; treat "close enough" to a waypoint as a quarter tile.
const REACH_THRESHOLD = 12;

// Arrow keys the drive loop toggles. Held state is tracked so we only send the
// key transitions that actually change between ticks.
type Arrow = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/**
 * Read live state plus the next path waypoint toward a goal tile, in one hop.
 * The return shape is inferred from the typed `__courier` hook, so the test
 * stays in sync with the game's E2E state contract automatically.
 */
async function readTick(page: Page, goalTileX: number, goalTileY: number) {
  const tick = await page.evaluate(
    (goal) => {
      const api = globalThis.__courier;
      if (api === undefined) {
        return null;
      }
      return { state: api.getState(), next: api.nextStepToward(goal.x, goal.y) };
    },
    { x: goalTileX, y: goalTileY },
  );
  if (tick === null) {
    throw new Error('the __courier test hook was not attached');
  }
  return tick;
}

/** Which arrow keys point from the courier toward a target world position. */
function desiredKeys(
  courier: { x: number; y: number },
  target: { x: number; y: number },
): Set<Arrow> {
  const want = new Set<Arrow>();
  if (target.x - courier.x > REACH_THRESHOLD) want.add('ArrowRight');
  else if (courier.x - target.x > REACH_THRESHOLD) want.add('ArrowLeft');
  if (target.y - courier.y > REACH_THRESHOLD) want.add('ArrowDown');
  else if (courier.y - target.y > REACH_THRESHOLD) want.add('ArrowUp');
  return want;
}

/** Send only the key transitions needed to move from `held` to `want`. */
async function applyKeys(page: Page, held: Set<Arrow>, want: Set<Arrow>): Promise<void> {
  for (const key of held) {
    if (!want.has(key)) {
      await page.keyboard.up(key);
      held.delete(key);
    }
  }
  for (const key of want) {
    if (!held.has(key)) {
      await page.keyboard.down(key);
      held.add(key);
    }
  }
}

/** Release every currently-held arrow key. */
async function releaseAll(page: Page, held: Set<Arrow>): Promise<void> {
  await applyKeys(page, held, new Set());
}

/**
 * Drive the courier onto the goal tile using real key presses, following the
 * game's pathfinding one waypoint at a time. Resolves once the courier's tile
 * matches the goal, or throws if it cannot get there within the step budget.
 */
async function driveToTile(
  page: Page,
  held: Set<Arrow>,
  goalTileX: number,
  goalTileY: number,
): Promise<void> {
  const maxSteps = 250;
  for (let step = 0; step < maxSteps; step++) {
    const { state, next } = await readTick(page, goalTileX, goalTileY);
    if (state.courier.tileX === goalTileX && state.courier.tileY === goalTileY) {
      await releaseAll(page, held);
      return;
    }
    if (next === null) {
      await releaseAll(page, held);
      throw new Error(`no path from (${state.courier.tileX},${state.courier.tileY}) to (${goalTileX},${goalTileY})`);
    }
    await applyKeys(page, held, desiredKeys(state.courier, next));
    // Let a few physics frames advance before re-reading position.
    await page.waitForTimeout(80);
  }
  await releaseAll(page, held);
  const { state } = await readTick(page, goalTileX, goalTileY);
  throw new Error(
    `courier stuck at (${state.courier.tileX},${state.courier.tileY}) heading for (${goalTileX},${goalTileY})`,
  );
}

test('drives a full delivery loop with real key presses', async ({ page }) => {
  test.setTimeout(90_000);

  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  // The `?e2e` flag tells the scene to attach the read-plus-navigate hook.
  await page.goto('./?e2e=1');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  // Focus the canvas so key events reach the game.
  await page.locator('#game canvas').click();
  await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, {
    timeout: 15_000,
  });

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

  // 2. Accept the first contract with a real key press ("1"). Cargo is picked
  //    up automatically in the home town, so status should become "carrying".
  await page.keyboard.press('1');
  await expect
    .poll(async () => (await readTick(page, home.tileX, home.tileY)).state.activeContractId, {
      timeout: 5_000,
    })
    .toBe('letters-to-eastwatch');
  const accepted = await readTick(page, home.tileX, home.tileY);
  expect(accepted.state.contractStatus).toBe('carrying');
  expect(accepted.state.destination).not.toBeNull();

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

  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  await page.goto('./?e2e=1');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('#game canvas').click();
  await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, {
    timeout: 15_000,
  });

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
