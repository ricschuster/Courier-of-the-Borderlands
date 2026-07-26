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

// The UI sounds that no other spec reaches (#385): starting a new game, a save
// that cannot be written, the minimap's own toggle branch, and a board contract
// refused for want of standing.
//
// The first two are read from the document-lifetime played log rather than from
// `lastPlayed`: starting a new game replaces the scene and its Audio with it, and
// a save failure fires during create() before a spec can attach to anything.
//
// With no sound device in CI, a call site that never fires is indistinguishable
// from one that does, which is trap 1 and the reason every one of these exists.

test('starting a new game sounds, and it is not a tick', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await bootE2E(page);

  await page.evaluate(() => globalThis.__courier?.clearAudioCue());
  await tapKey(page, 'N');
  // The scene routes through BootScene and back, so wait for the hook to
  // reattach rather than for a frame count on a scene that is going away.
  await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, {
    timeout: 15_000,
  });
  await waitForFrames(page, 4);

  const fresh = (await readTick(page, 0, 0)).state;
  expect(fresh.deliveries, 'a new game should start empty').toBe(0);
  // Flushed on the same frame it is requested, because scene.start replaces the
  // Audio before the next frame arrives. Without that, throwing a run away would
  // be the one deliberate press in the game that made no sound.
  expect(
    fresh.audio.played,
    `cues across the reset: ${fresh.audio.played.join(', ')}`,
  ).toContain('new-game');

  expect(errors, `runtime errors during the reset:\n${errors.join('\n')}`).toEqual([]);
});

test('a game that cannot save says so out loud', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);

  // Break writes to the save key only, so the mute preference and everything else
  // still work and this stays a test of the save path rather than of storage.
  await page.addInitScript(() => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function patched(key: string, value: string) {
      if (key.includes('courier-of-the-borderlands/save')) {
        throw new Error('storage is full');
      }
      return real.call(this, key, value);
    };
  });

  await bootE2E(page);
  await waitForFrames(page, 6);

  const state = (await readTick(page, 0, 0)).state;
  // The warning toast is what carries the information; the cue only makes it
  // land. Rare and genuinely important, so it is the one thing in this batch
  // loud enough to be an event.
  expect(state.toasts.current, 'the player should be told in words too').toContain(
    'will be lost when you close the tab',
  );
  expect(
    state.audio.played,
    `cues on a failing save: ${state.audio.played.join(', ')}`,
  ).toContain('save-failed');

  expect(errors, `runtime errors with storage broken:\n${errors.join('\n')}`).toEqual([]);
});

test('the minimap ticks open and closed like every other panel', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await bootE2E(page);

  // The minimap is the one overlay that does not block the world, so it toggles
  // through its own branch rather than the blocking-overlay one, and that branch
  // has no other spec. One open tick and one close tick between all five panels
  // means each branch has to reach the same pair.
  await tapKey(page, 'M');
  await expect
    .poll(async () => (await readTick(page, 0, 0)).state.audio.lastPlayed, { timeout: 5_000 })
    .toBe('panel-open');
  await tapKey(page, 'M');
  await expect
    .poll(async () => (await readTick(page, 0, 0)).state.audio.lastPlayed, { timeout: 5_000 })
    .toBe('panel-close');

  expect(errors, `runtime errors toggling the minimap:\n${errors.join('\n')}`).toEqual([]);
});

test('a contract the courier has no standing for refuses out loud', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await bootE2E(page, { turbo: true, noWear: true });
  const held = new Set<Arrow>();

  const start = (await readTick(page, 0, 0)).state;
  await driveToTile(page, held, start.home.tileX, start.home.tileY);
  await releaseAll(page, held);
  await seatAt(page, start.home.tileX, start.home.tileY);
  await waitForFrames(page, 2);

  // A fresh courier has no reputation, and the Northcairn writ asks for five.
  // The board renders the refusal rather than toasting it (#376), which is why it
  // needs a sound: the notice is easy to miss and the press otherwise looks
  // ignored. Found by id, since the board's contents shift as the arc opens work.
  const board = (await readTick(page, 0, 0)).state;
  const slot = board.availableContractIds.indexOf('writ-to-northcairn');
  expect(slot, `gated contract missing from ${board.availableContractIds.join(', ')}`)
    .toBeGreaterThanOrEqual(0);

  await page.evaluate(() => globalThis.__courier?.clearAudioCue());
  await tapKey(page, String(slot + 1));
  await waitForFrames(page, 2);

  const refused = (await readTick(page, 0, 0)).state;
  expect(refused.activeContractId, 'the contract must not have been accepted').toBeNull();
  expect(refused.armedContractId, 'a refusal must not arm the slot either').toBeNull();
  expect(refused.audio.lastPlayed).toBe('panel-refused');

  expect(errors, `runtime errors on a refused contract:\n${errors.join('\n')}`).toEqual([]);
});
