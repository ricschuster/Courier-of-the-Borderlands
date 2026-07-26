import { test, expect } from '@playwright/test';
import {
  bootE2E,
  collectErrors,
  driveToTile,
  readTick,
  seedUpgrades,
  tapKey,
  type Arrow,
} from './drive';

// The #362 spend gate, driven with real key presses. The arc used to be
// completable having bought nothing at all, which contradicted the pillar that
// gold and upgrades matter from the early game. Both roads out of the Greybridge
// hub now require the Reinforced Wheels fitted.
//
// Two things need proving in a browser, because neither is visible to a unit
// test: that pressing T on a gated gateway really does not move the courier, and
// that the refusal says what to buy rather than reading as a dead end.

test('refuses to leave the hub without the Reinforced Wheels, and names them', async ({ page }) => {
  test.setTimeout(90_000);

  const errors = collectErrors(page);

  // A fresh courier with nothing fitted: the state the gate exists for.
  await bootE2E(page);

  const held = new Set<Arrow>();
  const start = await readTick(page, 0, 0);
  expect(start.state.regionId).toBe('greybridge');
  expect(start.state.upgrades).toEqual([]);

  const toSaltreach = start.state.gateways.find((g) => g.to === 'saltreach');
  expect(toSaltreach, 'greybridge should have a gateway to saltreach').toBeDefined();

  await driveToTile(page, held, toSaltreach!.tileX, toSaltreach!.tileY);
  await tapKey(page, 'T');
  await page.waitForTimeout(500);

  // Still here. The press was refused, not merely slow.
  const after = await readTick(page, 0, 0);
  expect(after.state.regionId).toBe('greybridge');

  // And the refusal tells the player what to fit and what it costs, so a closed
  // road reads as a shopping list rather than a wall.
  //
  // Read by draining the queue rather than by reading `current` once: the boot
  // premise and the shop onboarding are both still queued by the time the
  // courier reaches the gateway, so the refusal is behind them. That is what a
  // player sees too, one dismiss press at a time.
  let toast = '';
  for (let i = 0; i < 8; i++) {
    const state = (await readTick(page, 0, 0)).state;
    if ((state.toasts.current ?? '').includes('Reinforced Wheels')) {
      toast = state.toasts.current ?? '';
      break;
    }
    await tapKey(page, 'Space');
  }

  expect(toast, 'the gate refusal never surfaced in the toast queue').not.toBe('');
  expect(toast).toContain('Reinforced Wheels');
  expect(toast).toContain('50c');
  expect(toast).toContain('Greywater');

  expect(errors, `runtime errors at the gate:\n${errors.join('\n')}`).toEqual([]);
});

test('opens the same gateway once the Reinforced Wheels are fitted', async ({ page }) => {
  test.setTimeout(90_000);

  const errors = collectErrors(page);

  // The identical run, differing only in the fitted upgrade, so a pass here and
  // a refusal above isolates the gate as the cause.
  await seedUpgrades(page, ['reinforced-wheels']);
  await bootE2E(page);

  const held = new Set<Arrow>();
  const start = await readTick(page, 0, 0);
  expect(start.state.upgrades).toEqual(['reinforced-wheels']);

  const toSaltreach = start.state.gateways.find((g) => g.to === 'saltreach');
  await driveToTile(page, held, toSaltreach!.tileX, toSaltreach!.tileY);
  await tapKey(page, 'T');

  await expect
    .poll(async () => (await readTick(page, 0, 0)).state.regionId, { timeout: 20_000 })
    .toBe('saltreach');

  expect(errors, `runtime errors travelling through the gate:\n${errors.join('\n')}`).toEqual([]);
});
