import { test, expect } from '@playwright/test';
import {
  bootE2E,
  collectErrors,
  driveToTile,
  readTick,
  releaseAll,
  seatAt,
  setSkillPanel,
  setUpgradeMenu,
  tapKey,
  waitForFrames,
  type Arrow,
} from './drive';

// Refusals render in the panel that raised them, not as toasts (#356).
//
// The 2026-07-24 persona playtest measured the cost of the alternative: with
// every refusal queued as a toast, a scripted shop visit could leave seven
// messages waiting, one dismiss press each. Refusals can only fire while their
// panel is open, so the panel carries them and the queue stays for news about
// the world.

test('a refused upgrade shows in the menu and queues no toast', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await bootE2E(page, { turbo: true, noWear: true });
  const held = new Set<Arrow>();

  const start = (await readTick(page, 0, 0)).state;
  await driveToTile(page, held, start.home.tileX, start.home.tileY);
  await releaseAll(page, held);
  await seatAt(page, start.home.tileX, start.home.tileY);
  await waitForFrames(page, 2);

  await setUpgradeMenu(page, true);
  await waitForFrames(page, 2);
  const before = (await readTick(page, 0, 0)).state;
  expect(before.coins, 'this spec needs a broke courier').toBe(0);
  expect(before.panelNotice).toBeNull();

  // Press every upgrade key. Each is unaffordable at 0 coins, so under the old
  // behaviour this queued one toast per press.
  for (const key of ['1', '2', '3', '4', '5', '6', '7']) {
    await tapKey(page, key);
    await waitForFrames(page, 2);
  }

  const after = (await readTick(page, 0, 0)).state;
  expect(after.panelNotice).toContain('Not enough coins');
  expect(after.panelNotice).toContain('short');
  // The refusal makes a sound too (#385). The strongest item in that batch: this
  // is feedback about a key the player just pressed, and without it a refused
  // press is indistinguishable from an ignored one.
  expect(after.audio.lastPlayed).toBe('panel-refused');
  // The queue is untouched: seven refusals cost zero dismiss presses.
  expect(after.toasts.pending).toBe(before.toasts.pending);
  expect(after.toasts.current).toBe(before.toasts.current);

  // Re-opening the menu starts clean rather than on the last complaint.
  await setUpgradeMenu(page, false);
  await waitForFrames(page, 2);
  await setUpgradeMenu(page, true);
  await waitForFrames(page, 2);
  expect((await readTick(page, 0, 0)).state.panelNotice).toBeNull();
  await setUpgradeMenu(page, false);

  expect(errors).toEqual([]);
});

test('a refused skill rank shows in the panel and queues no toast', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await bootE2E(page, { turbo: true, noWear: true });

  await setSkillPanel(page, true);
  await waitForFrames(page, 2);
  const before = (await readTick(page, 0, 0)).state;
  expect(before.skillPoints, 'this spec needs an unspent-point-free courier').toBe(0);

  await tapKey(page, '1');
  await waitForFrames(page, 2);

  const after = (await readTick(page, 0, 0)).state;
  expect(after.panelNotice).toContain('No skill point banked');
  expect(after.audio.lastPlayed).toBe('panel-refused');
  expect(after.toasts.pending).toBe(before.toasts.pending);
  expect(after.toasts.current).toBe(before.toasts.current);
  expect(errors).toEqual([]);
});
