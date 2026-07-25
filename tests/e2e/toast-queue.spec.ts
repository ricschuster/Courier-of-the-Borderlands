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

// Toasts group by burst: messages raised in the same frame share one panel and one
// dismiss press, later ones wait their turn (#327, regrouped in #378).
//
// Three behaviours are pinned here, and each fails differently under a different
// past version of this surface:
//
//   - An arrival burst is ONE panel and ONE press. Under #327's strict queue this
//     cost a press per message, which is what the 2026-07-25 playtest reported.
//   - A later message WAITS instead of joining the panel being read. Under the
//     original stacked-slot code it replaced the message in the slot, or stacked
//     over it.
//   - A press clears only what was on screen. Under the pre-#327 clear-all, one
//     Space wiped queued messages the player had never seen.
//
// Coordinates are read from live state rather than hardcoded, so this spec does
// not join the region-coordinate drift trap that CLAUDE.md warns about.

test('a burst of toasts shares one panel and one dismiss press', async ({ page }) => {
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
  await tapKey(page, 'Space');
  await waitForFrames(page, 2);

  // Arriving at home raises its settlement note and the upgrade-shop teach in the
  // same frame. That is the burst this change exists for: both are on screen at
  // once, as one panel.
  await driveToTile(page, held, boot.home.tileX, boot.home.tileY);
  await releaseAll(page, held);
  await seatAt(page, boot.home.tileX, boot.home.tileY);
  const arrival = (await readTick(page, 0, 0)).state.toasts;
  expect(arrival.shown, 'the arrival burst should group into one panel').toBeGreaterThan(1);
  // Every grouped message is really on screen, not just counted.
  expect(arrival.current).toContain('\n\n');
  // Nothing is hidden behind the group: it grouped rather than queued.
  expect(arrival.pending).toBe(0);

  // A message from a later frame waits instead of joining the panel mid-read.
  await tapKey(page, 'R');
  await waitForFrames(page, 2);
  const queued = (await readTick(page, 0, 0)).state.toasts;
  expect(queued.current).toBe(arrival.current);
  expect(queued.shown).toBe(arrival.shown);
  expect(queued.pending).toBe(1);

  // The same message re-raised does not cost a second press.
  await tapKey(page, 'R');
  await waitForFrames(page, 2);
  const repeated = (await readTick(page, 0, 0)).state.toasts;
  expect(repeated.current).toBe(arrival.current);
  expect(repeated.pending).toBe(1);

  // One press clears the whole arrival panel and promotes the waiting message.
  // Under #327 this took one press per grouped message; under the pre-#327
  // clear-all it took the waiting message with it, unread.
  await tapKey(page, 'Space');
  await waitForFrames(page, 2);
  const advanced = (await readTick(page, 0, 0)).state.toasts;
  expect(advanced.current).not.toBeNull();
  expect(advanced.current).not.toBe(arrival.current);
  expect(advanced.shown).toBe(1);
  expect(advanced.pending).toBe(0);

  // And the last press empties it.
  await tapKey(page, 'Space');
  await waitForFrames(page, 2);
  expect((await readTick(page, 0, 0)).state.toasts).toEqual({
    current: null,
    shown: 0,
    pending: 0,
  });

  expect(errors, `runtime errors during the toast queue run:\n${errors.join('\n')}`).toEqual([]);
});
