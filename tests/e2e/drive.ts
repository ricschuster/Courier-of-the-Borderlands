import { expect, type Page } from '@playwright/test';

/**
 * Press a key repeatedly until `done()` reports the action took effect. A single
 * keypress can be dropped if it lands between Phaser input ticks (far more
 * likely on a loaded CI runner, where the frame loop is throttled), so a
 * one-shot press is flaky. This checks first, then re-presses each poll until
 * the game registers it. Only safe where the input is a no-op once complete
 * (the contract board and shop both ignore further presses after they act).
 */
export async function pressUntil(
  page: Page,
  key: string,
  done: () => Promise<boolean>,
  timeoutMs = 15_000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        if (await done()) return true;
        await page.keyboard.press(key);
        return done();
      },
      { timeout: timeoutMs },
    )
    .toBe(true);
}

// Shared helpers for the input-driven e2e specs. Each spec boots the real built
// game with `?e2e`, reads live state and pathfinding waypoints through the
// typed `window.__courier` hook, and drives the courier with genuine key
// presses so it exercises the same path a player would.

// A single tile is 48px; treat "close enough" to a waypoint as a quarter tile.
export const REACH_THRESHOLD = 12;

// Arrow keys the drive loop toggles. Held state is tracked so we only send the
// key transitions that actually change between ticks.
export type Arrow = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/**
 * Read live state plus the next path waypoint toward a goal tile, in one hop.
 * The return shape is inferred from the typed `__courier` hook, so callers stay
 * in sync with the game's E2E state contract automatically.
 */
export async function readTick(page: Page, goalTileX: number, goalTileY: number) {
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
export function desiredKeys(
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
export async function applyKeys(page: Page, held: Set<Arrow>, want: Set<Arrow>): Promise<void> {
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
export async function releaseAll(page: Page, held: Set<Arrow>): Promise<void> {
  await applyKeys(page, held, new Set());
}

/**
 * Drive the courier onto the goal tile using real key presses, following the
 * game's pathfinding one waypoint at a time. Resolves once the courier's tile
 * matches the goal, or throws if it cannot get there within the step budget.
 * If `onTile` is given, it is called with every distinct tile the courier
 * occupies along the way, so callers can assert which route was taken.
 */
export async function driveToTile(
  page: Page,
  held: Set<Arrow>,
  goalTileX: number,
  goalTileY: number,
  onTile?: (tile: { x: number; y: number }) => void,
): Promise<void> {
  const maxSteps = 250;
  for (let step = 0; step < maxSteps; step++) {
    const { state, next } = await readTick(page, goalTileX, goalTileY);
    onTile?.({ x: state.courier.tileX, y: state.courier.tileY });
    if (state.courier.tileX === goalTileX && state.courier.tileY === goalTileY) {
      await releaseAll(page, held);
      return;
    }
    if (next === null) {
      await releaseAll(page, held);
      throw new Error(
        `no path from (${state.courier.tileX},${state.courier.tileY}) to (${goalTileX},${goalTileY})`,
      );
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

/**
 * Boot the built game with the `?e2e` hook attached and the canvas focused so
 * key events reach Phaser. Resolves once `window.__courier` is available.
 */
export async function bootE2E(page: Page): Promise<void> {
  await page.goto('./?e2e=1');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  // Focus the canvas so key events reach the game.
  await page.locator('#game canvas').click();
  await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, {
    timeout: 15_000,
  });
}

/**
 * Drive onto a gateway tile and travel through it with the "T" key into the
 * expected destination region. Presses T only while still in the origin region
 * (re-pressing after arrival would travel straight back) and tolerates the
 * brief window during the scene restart when the `__courier` hook is reattaching.
 *
 * Two things make a naive one-shot press flaky under CI load, and this guards
 * both. First, travel only fires when the courier is standing exactly on the
 * gateway tile: the key-up that ends driveToTile can be processed a frame late,
 * letting the courier coast one tile past the gateway, after which every T is a
 * no-op. So each iteration re-seats the courier onto the gateway if it drifted
 * off. Second, a single keypress can be dropped between input ticks, so T is
 * pressed at a steady fast cadence rather than backing off.
 */
export async function travelTo(
  page: Page,
  held: Set<Arrow>,
  gatewayTileX: number,
  gatewayTileY: number,
  fromRegionId: string,
  toRegionId: string,
  // Travel needs a full scene restart plus the hook reattaching, which is slow
  // under CI load; give the re-pressing loop room so a dropped T does not fail.
  timeoutMs = 30_000,
): Promise<void> {
  await driveToTile(page, held, gatewayTileX, gatewayTileY);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const region = await page.evaluate(() => globalThis.__courier?.getState().regionId ?? null);
    if (region === toRegionId) return;
    // The hook is briefly absent mid scene-restart; wait for it to reattach.
    if (region === null) {
      await page.waitForTimeout(100);
      continue;
    }
    if (region === fromRegionId) {
      // Re-seat onto the gateway if the courier coasted off it, then press T.
      const onGateway = await page.evaluate(
        (g) => {
          const c = globalThis.__courier?.getState().courier;
          return c !== undefined && c.tileX === g.x && c.tileY === g.y;
        },
        { x: gatewayTileX, y: gatewayTileY },
      );
      if (!onGateway) {
        await driveToTile(page, held, gatewayTileX, gatewayTileY);
      }
      await page.keyboard.press('T');
      await page.waitForTimeout(120);
    }
  }
  throw new Error(
    `travelTo timed out after ${timeoutMs}ms without reaching ${toRegionId} from ${fromRegionId}`,
  );
}

/** Collect console/page errors into an array for an end-of-test assertion. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}
