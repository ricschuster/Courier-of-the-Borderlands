import { test, expect } from '@playwright/test';

// Deterministic world-state test: an arc-gated contract must appear on the board
// once its story flag is set, and revealing it must NOT re-lock the region. We
// boot Greybridge from a save with every standing contract delivered and the
// postmaster's reveal flag set, then read live state through the e2e hook.
//
// Driving a full region clear with real input would be long and flaky, so this
// seeds the end-of-arc save directly. The gating logic itself is unit tested in
// contract-system.test.ts; this proves the scene wires it up and that the
// regionCleared decoupling holds (a naive board-empty definition would flip
// regionCleared to false the moment the gated contract appeared).

const BASE_GREYBRIDGE_CONTRACTS = [
  'letters-to-eastwatch',
  'grain-to-southmill',
  'rumours-to-ironhollow',
  'writ-to-northcairn',
  'secret-to-mirewatch',
  'secret-to-reedgrave',
];

test('an arc-gated contract appears after the reveal without re-locking the region', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  // Seed an end-of-Greybridge save: all standing contracts delivered, the
  // postmaster met, and the reveal flag set.
  await page.addInitScript((completed) => {
    localStorage.setItem(
      'courier-of-the-borderlands/save',
      JSON.stringify({
        version: 1,
        coins: 300,
        reputation: { eastwatch: 8, greywater: 6 },
        unlocks: [],
        upgrades: [],
        completed,
        visited: completed,
        regionId: 'greybridge',
        fogByRegion: {},
        activeContractId: null,
        contractStatus: null,
        distanceTiles: 0,
        deliveries: completed.length,
        achievements: [],
        storyFlags: ['met_postmaster', 'greybridge_reveal'],
      }),
    );
  }, BASE_GREYBRIDGE_CONTRACTS);

  await page.goto('./?e2e=1');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, { timeout: 15_000 });

  const state = await page.evaluate(() => globalThis.__courier!.getState());

  // The arc-gated contract is now on the board...
  expect(state.availableContractIds).toContain('greybridge-follow-the-letters');
  // ...while the delivered standing contracts are not.
  for (const id of BASE_GREYBRIDGE_CONTRACTS) {
    expect(state.availableContractIds).not.toContain(id);
  }
  // ...and the region still reads as cleared, so the derived home_reconnected
  // flag (and the spoke reveals it gates) is not re-locked by the new work.
  expect(state.regionCleared).toBe(true);

  // Open the journal so refreshJournal builds the Hidden Road thread lines (the
  // reveal flag is set, so the thread has started). This exercises the story
  // thread rendering in the real build; assert only that it does not throw.
  await page.locator('#game canvas').click();
  await page.keyboard.press('J');
  await page.waitForTimeout(300);

  expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('the arc-gated contract is hidden before the reveal', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  // Fresh game: no reveal flag, so the gated contract must not be offered.
  await page.goto('./?e2e=1');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, { timeout: 15_000 });

  const state = await page.evaluate(() => globalThis.__courier!.getState());
  expect(state.availableContractIds).not.toContain('greybridge-follow-the-letters');
  expect(state.availableContractIds).toContain('letters-to-eastwatch');
  expect(state.regionCleared).toBe(false);

  expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
