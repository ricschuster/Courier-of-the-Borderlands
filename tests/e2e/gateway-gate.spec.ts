import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, driveToTile, readTick, tapKey, type Arrow } from './drive';

// The hub is open. This replaces the #362 spend-gate spec, which proved the
// opposite: that pressing T on a gated gateway did not move the courier.
//
// #434 removed that exit lock. A gateway is access, and the rule is to gate
// shortcuts and never access (docs/design/10_open_world_expansion.md), so the
// world is enterable everywhere and survivable only in places.
//
// Worth proving in a browser rather than a unit test, for the same reason the
// old spec was: the unit suite can see that no gateway carries a requirement,
// but only a real run can show that pressing T with an empty wagon and an empty
// purse actually moves the courier between regions.

test('leaves the hub with nothing fitted and no coins spent', async ({ page }) => {
  test.setTimeout(90_000);

  const errors = collectErrors(page);

  // A fresh courier: nothing bought, which is precisely the state the old gate
  // existed to refuse.
  await bootE2E(page);

  const held = new Set<Arrow>();
  const start = await readTick(page, 0, 0);
  expect(start.state.regionId).toBe('greybridge');
  expect(start.state.upgrades).toEqual([]);

  const toSaltreach = start.state.gateways.find((g) => g.to === 'saltreach');
  expect(toSaltreach, 'greybridge should have a gateway to saltreach').toBeDefined();

  await driveToTile(page, held, toSaltreach!.tileX, toSaltreach!.tileY);
  await tapKey(page, 'T');

  await expect
    .poll(async () => (await readTick(page, 0, 0)).state.regionId, { timeout: 20_000 })
    .toBe('saltreach');

  // Still owning nothing on arrival. The crossing charged no toll of any kind,
  // so what makes the frontier hard has to be the frontier.
  const arrived = await readTick(page, 0, 0);
  expect(arrived.state.upgrades).toEqual([]);

  expect(errors, `runtime errors crossing the gateway:\n${errors.join('\n')}`).toEqual([]);
});

test('leaves by the southern road to Fenmarch just as freely', async ({ page }) => {
  test.setTimeout(90_000);

  const errors = collectErrors(page);

  // The other road out. Both were gated, so both need proving open.
  await bootE2E(page);

  const held = new Set<Arrow>();
  const start = await readTick(page, 0, 0);
  const toFenmarch = start.state.gateways.find((g) => g.to === 'fenmarch');
  expect(toFenmarch, 'greybridge should have a gateway to fenmarch').toBeDefined();

  await driveToTile(page, held, toFenmarch!.tileX, toFenmarch!.tileY);
  await tapKey(page, 'T');

  await expect
    .poll(async () => (await readTick(page, 0, 0)).state.regionId, { timeout: 20_000 })
    .toBe('fenmarch');

  expect(errors, `runtime errors crossing the gateway:\n${errors.join('\n')}`).toEqual([]);
});
