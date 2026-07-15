import { expect, type Page } from '@playwright/test';

/**
 * Press a key repeatedly until `done()` reports the action took effect. A single
 * keypress can be dropped if it lands between Phaser input ticks (far more
 * likely on a loaded CI runner, where the frame loop is throttled), so a
 * one-shot press is flaky. This checks first, then re-presses each poll until
 * the game registers it. Only safe where the input is a no-op once complete
 * (the contract board and shop both ignore further presses after they act).
 *
 * Each attempt holds the key via `tapKey` rather than an instantaneous
 * `press`. A zero-gap down+up can land entirely between two starved frames and
 * never be observed down, so even a re-pressing loop can burn its whole timeout
 * dropping every attempt; holding for a beat guarantees the next frame sees it.
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
        await tapKey(page, key);
        return done();
      },
      { timeout: timeoutMs },
    )
    .toBe(true);
}

/**
 * Wait until the game's update loop has advanced by at least `frames` frames,
 * however slowly they arrive. Wall-clock waits assume frames keep a steady
 * cadence, which a loaded CI runner breaks: an 80ms wait can contain zero
 * frames (nothing happened yet) while a 150ms key hold can end before any
 * frame observed the key. Anchoring on the game's frame counter makes every
 * wait mean "the game actually ran". The timeout is a hard failure bound: a
 * frame loop that stalls that long is a real bug, not runner load.
 *
 * Tolerates the hook being momentarily absent (region-travel scene restart):
 * the counter is monotonic across restarts, so the wait simply resumes once
 * the hook reattaches.
 */
export async function waitForFrames(
  page: Page,
  frames: number,
  timeoutMs = 15_000,
): Promise<void> {
  const start = await page.evaluate(() => globalThis.__courier?.getFrame() ?? null);
  if (start === null) {
    // The hook is momentarily absent (mid scene-restart). Wait for it to
    // reattach, then count `frames` from its first visible value: anchoring on
    // a real start is what makes the N-frame hold guarantee hold. (A naive
    // fallback start would let the wait complete the instant the hook appears,
    // observing zero new frames and voiding tapKey's "a frame saw the key".)
    await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, {
      timeout: timeoutMs,
    });
    await waitForFrames(page, frames, timeoutMs);
    return;
  }
  await page.waitForFunction(
    (arg) => {
      const api = globalThis.__courier;
      return api !== undefined && api.getFrame() >= arg.from + arg.n;
    },
    { from: start, n: frames },
    { timeout: timeoutMs },
  );
}

/**
 * Press a key by holding it down across game frames rather than an
 * instantaneous tap. The game reads one-shot inputs (accept contract, talk,
 * buy, dismiss) with JustDown, and Phaser clears the pending flag on keyup, so
 * a down+up that lands entirely between two starved frames is silently lost.
 * Holding until the frame counter has advanced guarantees a frame observed the
 * key down, no matter how throttled the runner. Safe for these inputs because
 * JustDown fires once per down-transition, so a held key still acts exactly
 * once.
 */
export async function tapKey(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key);
  try {
    // Two frames: one may already be mid-step when the down lands; the second
    // is guaranteed to start with the key down and process it.
    await waitForFrames(page, 2);
  } finally {
    await page.keyboard.up(key);
  }
}

/**
 * Settle the wagon exactly onto a tile it has already driven to. A drive
 * arrives with residual velocity that one sparse frame can carry a tile or two
 * past the goal before the game re-reads the released keys, so every
 * exact-tile interaction gate (contract board, talk, repair, travel) can miss
 * under CI load; re-driving just repeats the same race. seat() zeroes velocity
 * and snaps to the tile centre, and refuses distances over 3 tiles so a spec
 * cannot use it to skip driving. Waits a frame after the snap so the game has
 * observed the seated position before the caller presses an interaction key.
 */
export async function seatAt(page: Page, tileX: number, tileY: number): Promise<void> {
  const seated = await page.evaluate(
    (t) => globalThis.__courier?.seat(t.x, t.y) ?? false,
    { x: tileX, y: tileY },
  );
  if (!seated) {
    throw new Error(`seatAt(${tileX},${tileY}) refused: wagon too far from the tile`);
  }
  await waitForFrames(page, 1);
}

/**
 * Drive the skill panel to open (or closed) with the "k" toggle, robustly. A
 * single "k" can be dropped between Phaser input ticks under CI load, so this
 * re-presses; but "k" is a toggle, so pressUntil (which can fire an extra press
 * that flips it back) is unsafe here. Instead it checks state first and only
 * presses when the panel is in the wrong state, waiting long enough after each
 * press for the game to register it before deciding to press again.
 */
export async function setSkillPanel(page: Page, open: boolean): Promise<void> {
  const readOpen = () =>
    page.evaluate(() => globalThis.__courier?.getState().skillPanelOpen ?? null);
  for (let attempt = 0; attempt < 8; attempt++) {
    if ((await readOpen()) === open) return;
    // Hold the key down and poll for the toggle, rather than an instantaneous
    // press. The game reads the toggle with JustDown, which only sees the key if
    // it is down on a frame boundary. Under a starved frame loop a down+up can
    // land entirely between two frames, so the key is never observed down and
    // the press is silently lost (the cause of the arc flake: a dropped skill-
    // panel close left the panel open, swallowing the contract-accept key).
    // Holding it down guarantees the next frame, however delayed, sees it; we
    // release as soon as the state flips so the held key toggles exactly once.
    await page.keyboard.down('k');
    try {
      await expect.poll(readOpen, { timeout: 3000, intervals: [50, 100, 200, 400] }).toBe(open);
    } catch {
      // No frame processed the key within the window; release and retry.
    } finally {
      await page.keyboard.up('k');
    }
    if ((await readOpen()) === open) return;
  }
  throw new Error(`skill panel did not ${open ? 'open' : 'close'} after retries`);
}

/**
 * Drive the wagon upgrade menu to open (or closed) with the "B" toggle, the same
 * way setSkillPanel handles the "k" panel. Opening is gated to the home shop, so
 * only call this at home when opening; closing works anywhere. "B" is a toggle,
 * so pressUntil (which can fire an extra press that flips it back) is unsafe;
 * this checks state first and only presses when the menu is in the wrong state,
 * holding the key across frames so a starved frame loop cannot drop it.
 */
export async function setUpgradeMenu(page: Page, open: boolean): Promise<void> {
  const readOpen = () =>
    page.evaluate(() => globalThis.__courier?.getState().upgradeMenuOpen ?? null);
  for (let attempt = 0; attempt < 8; attempt++) {
    if ((await readOpen()) === open) return;
    await page.keyboard.down('B');
    try {
      await expect.poll(readOpen, { timeout: 3000, intervals: [50, 100, 200, 400] }).toBe(open);
    } catch {
      // No frame processed the key within the window; release and retry.
    } finally {
      await page.keyboard.up('B');
    }
    if ((await readOpen()) === open) return;
  }
  throw new Error(`upgrade menu did not ${open ? 'open' : 'close'} after retries`);
}

/**
 * Buy every affordable, not-yet-fitted wagon upgrade at the home shop. Opens the
 * upgrade menu, presses each upgrade's number key once (an unaffordable or
 * already-owned upgrade ignores the press), then closes the menu so later number
 * keys reach the contract board. The seven Greybridge upgrades map to keys 1-7
 * in data order (see src/data/upgrades-greybridge.ts). Must be called at home,
 * where the menu can open.
 */
export async function buyAffordableUpgrades(page: Page): Promise<void> {
  await setUpgradeMenu(page, true);
  for (const key of ['1', '2', '3', '4', '5', '6', '7']) {
    await tapKey(page, key);
    await waitForFrames(page, 2);
  }
  await setUpgradeMenu(page, false);
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
  const maxSteps = 400;
  for (let step = 0; step < maxSteps; step++) {
    const { state, next } = await readTick(page, goalTileX, goalTileY);
    onTile?.({ x: state.courier.tileX, y: state.courier.tileY });
    if (state.courier.tileX === goalTileX && state.courier.tileY === goalTileY) {
      await releaseAll(page, held);
      return;
    }
    // A road encounter can open mid-drive and freeze movement modally. If the
    // goal is elsewhere, step away from it with Escape and keep driving; the
    // encounter stays unresolved but does not re-open until the tile is
    // re-entered, so travel through it is not blocked. Release the held arrows
    // BEFORE the Escape: the freeze does not release our keys, so closing the
    // dialogue would otherwise resume motion instantly and coast the wagon past
    // the trigger tile, and when the trigger sits on a turn every route must
    // take (an unresolved encounter re-fires on re-entry), the drive doubles
    // back over it and livelocks the step budget away under CI load.
    if (state.dialogueOpen) {
      await releaseAll(page, held);
      await tapKey(page, 'Escape');
      await waitForFrames(page, 2);
      continue;
    }
    if (next === null) {
      await releaseAll(page, held);
      throw new Error(
        `no path from (${state.courier.tileX},${state.courier.tileY}) to (${goalTileX},${goalTileY})`,
      );
    }
    await applyKeys(page, held, desiredKeys(state.courier, next));
    // Advance exactly one game frame, then re-read. Waiting on the frame counter
    // (not wall-clock) means every step is real game progress, so the step
    // budget no longer depends on runner speed. One frame, not two: held arrow
    // keys are read with isDown, so a single frame both observes them and moves,
    // and with the e2e frame-delta clamp one frame moves the wagon under a tile
    // even at full kit. Sampling every frame therefore cannot hop over the goal
    // tile (a 2-frame gap could, causing a false "courier stuck").
    await waitForFrames(page, 1);
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
 *
 * Pass `{ turbo: true }` to also set `?turbo`, which doubles the wagon speed
 * (test-only) so a long multi-delivery drive finishes in about half the
 * wall-clock. Movement stays real key input on the same paths; only the speed
 * scales.
 *
 * Pass `{ noWear: true }` to also set `?nowear`, which disables wagon-condition
 * wear (ADR 0005) for the run. The full-arc arc is a reachability / soft-lock
 * guard, not a travel-sink test, and under CI load a leg can drain the wagon to
 * limp speed mid-drive and read as a stall; the sink is unit tested separately.
 */
export async function bootE2E(
  page: Page,
  options: { turbo?: boolean; noWear?: boolean } = {},
): Promise<void> {
  const params = ['e2e=1'];
  if (options.turbo) params.push('turbo=1');
  if (options.noWear) params.push('nowear=1');
  await page.goto(`./play.html?${params.join('&')}`);
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
 * gateway tile: the drive can end with residual velocity that coasts the wagon
 * off the gateway, after which every T is a no-op. So each iteration settles
 * the wagon back onto the gateway with seat() before pressing. Second, a
 * zero-gap keypress can be dropped between starved frames, so T is held across
 * game frames via tapKey and retried until the region flips.
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
      // Settle exactly onto the gateway (the drive can leave the wagon coasted
      // a tile or two off it), then hold T across a frame so the press cannot
      // be dropped between starved frames. seat() refuses long distances, so
      // fall back to driving if the wagon somehow drifted further than a coast.
      const seated = await page.evaluate(
        (g) => globalThis.__courier?.seat(g.x, g.y) ?? false,
        { x: gatewayTileX, y: gatewayTileY },
      );
      if (!seated) {
        await driveToTile(page, held, gatewayTileX, gatewayTileY);
        continue;
      }
      await waitForFrames(page, 1);
      await tapKey(page, 'T');
      await waitForFrames(page, 2);
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
