import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, driveToTile, pressUntil, readTick, type Arrow } from './drive';

// Input-driven capstone test: seed a save one choice away from the end (both
// spokes revealed, home reconnected), drive to the Greywater postmaster, take
// the "both roads are open" choice with a real key press, and assert the
// end-of-arc capstone panel appears once the blockade flag flips. All input is
// genuine keyboard input flowing through Phaser.

const GREYBRIDGE_STANDING = [
  'letters-to-eastwatch',
  'grain-to-southmill',
  'rumours-to-ironhollow',
  'writ-to-northcairn',
  'secret-to-mirewatch',
];

test('breaking the blockade at Greywater shows the end-of-arc capstone', async ({ page }) => {
  test.setTimeout(90_000);

  const errors = collectErrors(page);

  // Seed a save one dialogue choice from the end: Greybridge reconnected and
  // both spoke reveals known, but the blockade not yet broken.
  await page.addInitScript((completed) => {
    localStorage.setItem(
      'courier-of-the-borderlands/save',
      JSON.stringify({
        version: 1,
        coins: 400,
        reputation: { greywater: 8, eastwatch: 6 },
        unlocks: [],
        upgrades: [],
        completed,
        visited: [...completed, 'greywater', 'eastwatch', 'southmill', 'ironhollow', 'northcairn', 'mirewatch'],
        regionId: 'greybridge',
        fogByRegion: {},
        activeContractId: null,
        contractStatus: null,
        distanceTiles: 120,
        deliveries: completed.length,
        achievements: [],
        storyFlags: ['met_postmaster', 'greybridge_reveal', 'saltreach_method', 'fenmarch_cost'],
      }),
    );
  }, GREYBRIDGE_STANDING);

  await bootE2E(page);

  const held = new Set<Arrow>();
  const start = await readTick(page, 0, 0);
  expect(start.state.storyFlags).not.toContain('blockade_broken');
  expect(start.state.capstoneVisible).toBe(false);

  // Drive to the home town where the postmaster speaks.
  const home = start.state.home;
  await driveToTile(page, held, home.tileX, home.tileY);
  const read = () => readTick(page, home.tileX, home.tileY);

  // Open the conversation.
  await pressUntil(page, 'e', async () => (await read()).state.dialogueOpen);

  // Find the "both roads are open again" choice by label and take it, which sets
  // the blockade-broken flag.
  const choices = (await read()).state.dialogueChoices;
  const idx = choices.findIndex((c) => c.toLowerCase().startsWith('both roads'));
  expect(idx, `expected a "both roads" choice among ${JSON.stringify(choices)}`).toBeGreaterThanOrEqual(0);
  await pressUntil(
    page,
    String(idx + 1),
    async () => (await read()).state.storyFlags.includes('blockade_broken'),
  );
  expect((await read()).state.storyFlags).toContain('blockade_broken');

  // Step away from the resolution node; the capstone panel then appears.
  await pressUntil(page, 'Escape', async () => !(await read()).state.dialogueOpen);
  await expect.poll(async () => (await read()).state.capstoneVisible).toBe(true);

  // Esc again dismisses the capstone, and it stays gone.
  await pressUntil(page, 'Escape', async () => !(await read()).state.capstoneVisible);
  expect((await read()).state.capstoneVisible).toBe(false);

  expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
