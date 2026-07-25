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

// Sound effects are wired to real game moments, and V really silences them (#226).
//
// Why this spec has to exist at all: e2e runs with Phaser's noAudio manager and no
// AudioContext, so nothing can be heard and a call site that never fires looks
// exactly like one that does. That is trap 1's function-with-no-caller, and it is
// the same reason juice exposes isEnabled(). The audio system records the cue it
// was last asked for, and this asserts on that record.
//
// Two things are pinned, and each fails differently:
//
//   - Accepting a contract and completing a delivery each request their own cue.
//     A missing call site leaves the record null.
//   - After V, the same actions request nothing. A mute that is stored but ignored
//     at the point of play would still record a cue here.
//
// Coordinates come from live state, never hardcoded, so this spec stays out of the
// region-coordinate drift trap.

test('game moments request their cues, and V silences them', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await bootE2E(page, { turbo: true, noWear: true });
  const held = new Set<Arrow>();

  const start = (await readTick(page, 0, 0)).state;
  expect(start.audio.muted, 'sound defaults on').toBe(false);

  // Drive home and take a contract: the accept cue is the first proof of wiring.
  await driveToTile(page, held, start.home.tileX, start.home.tileY);
  await releaseAll(page, held);
  await seatAt(page, start.home.tileX, start.home.tileY);
  await waitForFrames(page, 2);

  await page.evaluate(() => globalThis.__courier?.clearAudioCue());
  // Two presses: the board arms on the first and commits on the second (#321).
  await tapKey(page, '1');
  await waitForFrames(page, 2);
  await tapKey(page, '1');
  await waitForFrames(page, 2);
  const accepted = (await readTick(page, 0, 0)).state;
  expect(accepted.activeContractId, 'the spec needs a contract in hand').not.toBeNull();
  expect(accepted.audio.lastCue).toBe('contract-accepted');

  // Deliver it. The delivery cue is the one a player hears most, so it is the one
  // worth proving end to end.
  await page.evaluate(() => globalThis.__courier?.clearAudioCue());
  const carrying = (await readTick(page, 0, 0)).state;
  const target = carrying.destination ?? carrying.pickup;
  expect(target, 'the contract should name somewhere to drive').not.toBeNull();
  if (target !== null) {
    await driveToTile(page, held, target.tileX, target.tileY);
    await releaseAll(page, held);
    await waitForFrames(page, 4);
  }
  const delivered = (await readTick(page, 0, 0)).state;
  expect(delivered.deliveries, 'the delivery should have landed').toBeGreaterThan(0);
  expect(delivered.audio.lastCue).toBe('delivered');
  // An arrival stacks several requests into one frame, and exactly one of them is
  // heard (#383). This is the live proof that the flush runs at all: without it
  // nothing would ever play, and `lastCue` above would still be green.
  expect(delivered.audio.lastPlayed, 'the delivery lost its own frame').toBe('delivered');

  // Mute, and prove the next moment requests nothing rather than merely storing a
  // flag. Works with messages on screen, so no need to clear the queue first.
  await tapKey(page, 'V');
  await waitForFrames(page, 2);
  const muted = (await readTick(page, 0, 0)).state;
  expect(muted.audio.muted).toBe(true);
  // The hint line carries the way back, because silence otherwise reads as broken.
  expect(muted.hintText).toContain('V: sound');

  await page.evaluate(() => globalThis.__courier?.clearAudioCue());
  // Head home and accept again: the same path that requested a cue above.
  const afterDelivery = (await readTick(page, 0, 0)).state;
  await driveToTile(page, held, afterDelivery.home.tileX, afterDelivery.home.tileY);
  await releaseAll(page, held);
  await seatAt(page, afterDelivery.home.tileX, afterDelivery.home.tileY);
  await waitForFrames(page, 2);
  await tapKey(page, '1');
  await waitForFrames(page, 2);
  await tapKey(page, '1');
  await waitForFrames(page, 2);
  const mutedAccept = (await readTick(page, 0, 0)).state;
  expect(mutedAccept.activeContractId, 'the accept itself must still work').not.toBeNull();
  expect(mutedAccept.audio.lastCue, 'a muted game requests no cue').toBeNull();

  // And V again brings it back, so the toggle is not one-way.
  await tapKey(page, 'V');
  await waitForFrames(page, 2);
  const unmuted = (await readTick(page, 0, 0)).state;
  expect(unmuted.audio.muted).toBe(false);
  expect(unmuted.hintText).not.toContain('V: sound');

  expect(errors, `runtime errors during the audio run:\n${errors.join('\n')}`).toEqual([]);
});
