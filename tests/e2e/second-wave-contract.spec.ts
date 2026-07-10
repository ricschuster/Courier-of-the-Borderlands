import { test, expect } from '@playwright/test';

// World-state test: reconnecting a place must open new work on the board. We seed
// a Greybridge save with one standing delivery done (so Eastwatch is reconnected)
// and read the e2e hook: the second-wave lateral route gated on that reconnection
// must now be available, while a route gated on a still-silent place stays hidden.
// The derived reconnected_<id> flag wiring is what this proves end to end; the
// gate logic itself is unit tested in contract-system.

test('reconnecting a place opens its second-wave contract on the board', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  // Seed: only the Eastwatch delivery is done, so Eastwatch is reconnected and
  // Northcairn is still silent.
  await page.addInitScript(() => {
    localStorage.setItem(
      'courier-of-the-borderlands/save',
      JSON.stringify({
        version: 1,
        coins: 100,
        reputation: { eastwatch: 4 },
        unlocks: [],
        upgrades: [],
        completed: ['letters-to-eastwatch'],
        visited: ['greywater', 'eastwatch'],
        regionId: 'greybridge',
        fogByRegion: {},
        activeContractId: null,
        contractStatus: null,
        distanceTiles: 20,
        deliveries: 1,
        achievements: [],
        storyFlags: [],
      }),
    );
  });

  await page.goto('./?e2e=1');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, { timeout: 15_000 });

  const state = await page.evaluate(() => globalThis.__courier!.getState());

  // Eastwatch is reconnected, so its second-wave route is on the board...
  expect(state.availableContractIds).toContain('greybridge-eastwatch-relay');
  // ...but Northcairn is still silent, so its route stays hidden.
  expect(state.availableContractIds).not.toContain('greybridge-northcairn-relay');

  expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
