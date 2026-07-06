import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, driveToTile, pressUntil, readTick, type Arrow } from './drive';

// Input-driven upgrade purchase: boot the real built game, complete a
// delivery to earn coins, then drive back to the home town and buy the
// cheapest vehicle upgrade with a real key press ("B"). Verifies coins drop
// by the upgrade cost and the purchase persists to the save. Shared drive
// helpers live in ./drive.

test('completes a delivery and buys the cheapest upgrade at home', async ({ page }) => {
  test.setTimeout(90_000);

  const errors = collectErrors(page);

  await bootE2E(page);

  const held = new Set<Arrow>();

  // Baseline: fresh game, no upgrades, no coins.
  const start = await readTick(page, 0, 0);
  expect(start.state.regionId).toBe('greybridge');
  expect(start.state.upgrades).toEqual([]);
  expect(start.state.coins).toBe(0);

  // 1. Drive to the home town so the contract board is reachable.
  const home = start.state.home;
  await driveToTile(page, held, home.tileX, home.tileY);

  // 2. Accept the first contract with a real key press ("1"), re-pressing until
  //    it registers (a single press can be dropped under CI load). Cargo is
  //    picked up automatically in the home town, so status becomes "carrying".
  await pressUntil(
    page,
    '1',
    async () =>
      (await readTick(page, home.tileX, home.tileY)).state.activeContractId ===
      'letters-to-eastwatch',
  );
  const accepted = await readTick(page, home.tileX, home.tileY);
  expect(accepted.state.contractStatus).toBe('carrying');
  expect(accepted.state.destination).not.toBeNull();

  // 3. Drive to the delivery destination.
  const dest = accepted.state.destination!;
  await driveToTile(page, held, dest.tileX, dest.tileY);

  // 4. The delivery completes on arrival; wait for the reward to land.
  await expect
    .poll(async () => (await readTick(page, dest.tileX, dest.tileY)).state.deliveries, {
      timeout: 5_000,
    })
    .toBe(1);
  const delivered = await readTick(page, dest.tileX, dest.tileY);
  // The contract pays a fixed 50 coin reward. Assert loosely to stay robust
  // to future reward tuning, but this is expected to be exactly 50 today.
  expect(delivered.state.coins).toBeGreaterThanOrEqual(40);
  const coinsAfterDelivery = delivered.state.coins;

  // 5. Drive back to the home town to reach the upgrade shop.
  await driveToTile(page, held, home.tileX, home.tileY);
  const backHome = await readTick(page, home.tileX, home.tileY);
  expect(backHome.state.atHome).toBe(true);

  // 6. Buy the cheapest upgrade with a real key press ("B"), re-pressing until
  //    it registers. The cheapest Greybridge upgrade is "far-lantern" at cost
  //    40 (see src/data/upgrades-greybridge.ts); with 10 coins left after the
  //    purchase, no further upgrade is affordable, so extra presses are no-ops.
  await pressUntil(page, 'B', async () =>
    (await readTick(page, home.tileX, home.tileY)).state.upgrades.includes('far-lantern'),
  );
  const afterBuy = await readTick(page, home.tileX, home.tileY);
  expect(afterBuy.state.coins).toBe(coinsAfterDelivery - 40);

  // 7. The purchase must persist to the save.
  const save = await page.evaluate(() =>
    localStorage.getItem('courier-of-the-borderlands/save'),
  );
  const parsed = JSON.parse(save ?? '{}');
  expect(parsed.upgrades).toContain('far-lantern');
  expect(parsed.coins).toBe(coinsAfterDelivery - 40);

  // No runtime errors during the whole run.
  expect(errors, `runtime errors during upgrade purchase run:\n${errors.join('\n')}`).toEqual([]);
});
