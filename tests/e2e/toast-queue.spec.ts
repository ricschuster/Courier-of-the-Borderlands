import { test, expect } from '@playwright/test';
import {
  bootE2E,
  collectErrors,
  driveToTile,
  readTick,
  releaseAll,
  seatAt,
  tapKey,
  waitForFrames,
  type Arrow,
} from './drive';

// Toasts queue one at a time and each costs its own dismiss press (#327).
//
// Two behaviours are pinned here, and each one fails differently under the old
// stacked-slot code: a second message used to replace the first in its slot (or
// stack beside it) rather than wait behind it, and one Space used to clear every
// toast on screen, so anything the player had not read yet was lost.
//
// Coordinates are read from live state rather than hardcoded, so this spec does
// not join the region-coordinate drift trap that CLAUDE.md warns about.

test('toasts queue one at a time and each costs its own dismiss press', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);

  // noWear keeps the wagon at full condition through the drive, so R reliably
  // reports "in good repair" instead of spending coins on a real repair.
  await bootE2E(page, { noWear: true });
  const held = new Set<Arrow>();

  // Boot raises a message (the intro on a first-ever run, the region status line
  // otherwise), so the queue starts busy.
  const boot = (await readTick(page, 0, 0)).state;
  expect(boot.toasts.current).not.toBeNull();

  // R only acts on a settlement tile, so drive home first.
  await driveToTile(page, held, boot.home.tileX, boot.home.tileY);
  await releaseAll(page, held);
  await seatAt(page, boot.home.tileX, boot.home.tileY);

  // Whatever is up after the drive is the baseline: arriving at home may have
  // added its own note, and this spec asserts on the deltas rather than on an
  // exact queue depth it does not control.
  const before = (await readTick(page, 0, 0)).state.toasts;
  expect(before.current).not.toBeNull();

  // A new message waits behind the one being read instead of replacing it.
  await tapKey(page, 'R');
  await waitForFrames(page, 2);
  const queued = (await readTick(page, 0, 0)).state.toasts;
  expect(queued.current).toBe(before.current);
  expect(queued.pending).toBe(before.pending + 1);

  // The same message re-raised does not cost a second press.
  await tapKey(page, 'R');
  await waitForFrames(page, 2);
  const repeated = (await readTick(page, 0, 0)).state.toasts;
  expect(repeated.current).toBe(before.current);
  expect(repeated.pending).toBe(before.pending + 1);

  // One press advances by one. Under the old clear-all this left nothing on
  // screen and the queued message was never read.
  await tapKey(page, 'Space');
  await waitForFrames(page, 2);
  const advanced = (await readTick(page, 0, 0)).state.toasts;
  expect(advanced.current).not.toBeNull();
  expect(advanced.current).not.toBe(before.current);
  expect(advanced.pending).toBe(before.pending);

  // Draining the rest costs exactly one press per remaining message.
  const remaining = advanced.pending + 1;
  for (let i = 0; i < remaining; i++) {
    const state = (await readTick(page, 0, 0)).state.toasts;
    expect(state.current, `queue emptied after ${i} of ${remaining} presses`).not.toBeNull();
    await tapKey(page, 'Space');
    await waitForFrames(page, 2);
  }
  expect((await readTick(page, 0, 0)).state.toasts).toEqual({ current: null, pending: 0 });

  expect(errors, `runtime errors during the toast queue run:\n${errors.join('\n')}`).toEqual([]);
});
