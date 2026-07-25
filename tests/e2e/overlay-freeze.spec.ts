import { test, expect } from '@playwright/test';
import {
  applyKeys,
  bootE2E,
  collectErrors,
  readTick,
  releaseAll,
  setSkillPanel,
  tapKey,
  waitForFrames,
  type Arrow,
} from './drive';

// A blocking overlay is modal: it pauses the world the way a conversation does
// (#300). Before this, panels were a cosmetic layer over live gameplay, and the
// blind run drove twelve tiles behind one without knowing.
//
// The spec pins both directions, because the failure modes point opposite ways:
// freezing too little leaves the wagon driveable behind the panel, and freezing
// too much (an early return that skips the panel's own handlers) leaves the
// player stuck inside a panel they cannot use or close.

test('a blocking overlay pauses the world but still takes panel input', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);

  // Wear is left on: if the wagon moves at all behind the panel, it wears, and
  // that is the damage the blind run reported.
  await bootE2E(page);
  const held = new Set<Arrow>();

  const before = (await readTick(page, 0, 0)).state;
  await setSkillPanel(page, true);

  // Hold a direction for long enough that an unfrozen wagon would cross tiles.
  await applyKeys(page, held, new Set<Arrow>(['ArrowRight']));
  await waitForFrames(page, 30);
  await releaseAll(page, held);
  await waitForFrames(page, 2);

  const driven = (await readTick(page, 0, 0)).state;
  expect(driven.courier.x).toBe(before.courier.x);
  expect(driven.courier.y).toBe(before.courier.y);
  expect(driven.courier.tileX).toBe(before.courier.tileX);
  expect(driven.courier.tileY).toBe(before.courier.tileY);
  expect(driven.wagonWearTotal).toBe(before.wagonWearTotal);
  expect(driven.wagonCondition).toBe(before.wagonCondition);
  expect(driven.fogRevealed).toBe(before.fogRevealed);

  // World keys are inert behind the panel. R at full condition would normally
  // queue "The wagon is in good repair.", so the queue depth is the proof.
  const toastsBefore = driven.toasts;
  await tapKey(page, 'R');
  await waitForFrames(page, 2);
  expect((await readTick(page, 0, 0)).state.toasts).toEqual(toastsBefore);

  // The panel's own input still runs. With no banked point, a skill digit
  // reports that the skill cannot be improved, which is only reachable if
  // handleSkillInput ran while the overlay was up. The boot message is still on
  // screen, so the new message lands in the queue behind it.
  expect(driven.skillPoints).toBe(0);
  await tapKey(page, '1');
  await waitForFrames(page, 2);
  const afterDigit = (await readTick(page, 0, 0)).state;
  expect(afterDigit.toasts.pending).toBe(toastsBefore.pending + 1);

  // The control hint tracks the panel rather than freezing on the world's keys
  // (#355). Before the fix it kept advertising driving, repair, and the toast
  // dismiss, all of which the freeze had just made inert.
  const hint = (await readTick(page, 0, 0)).state.hintText;
  expect(hint).toContain('Esc or K: close');
  expect(hint).not.toContain('drive');
  expect(hint).not.toContain('dismiss');
  expect(hint).not.toContain('repair');

  // And the panel still closes with its own toggle key (setSkillPanel throws if
  // it does not), after which the world runs again.
  await setSkillPanel(page, false);
  await applyKeys(page, held, new Set<Arrow>(['ArrowRight']));
  await waitForFrames(page, 30);
  await releaseAll(page, held);
  await waitForFrames(page, 2);

  const resumed = (await readTick(page, 0, 0)).state;
  expect(resumed.courier.x).toBeGreaterThan(before.courier.x);
  // The world hint comes back with the panel closed.
  expect(resumed.hintText).toContain('drive');

  expect(errors, `runtime errors during the overlay freeze run:\n${errors.join('\n')}`).toEqual([]);
});
