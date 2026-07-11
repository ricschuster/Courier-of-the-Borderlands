import { test, expect } from '@playwright/test';
import {
  bootE2E,
  collectErrors,
  driveToTile,
  pressUntil,
  readTick,
  setSkillPanel,
  type Arrow,
} from './drive';

// Input-driven test for a social skill unlocking dialogue. A save is seeded
// with enough distance to grant one skill point, then the test spends it on
// Cipher through the skills panel with a real number press (proving the fourth
// skill is selectable) and confirms the Cipher-only line then appears in the
// postmaster conversation. All input is genuine keyboard input through Phaser.

test('spending a point on Cipher unlocks a gated dialogue line', async ({ page }) => {
  test.setTimeout(90_000);

  const errors = collectErrors(page);

  // Seed a save with enough distance to reach level 2 (50 XP), granting one
  // skill point, so the test does not need to grind a delivery first.
  await page.addInitScript(() => {
    localStorage.setItem(
      'courier-of-the-borderlands/save',
      JSON.stringify({
        version: 1,
        coins: 0,
        reputation: {},
        unlocks: [],
        upgrades: [],
        completed: [],
        visited: [],
        regionId: 'greybridge',
        fogByRegion: {},
        activeContractId: null,
        contractStatus: null,
        distanceTiles: 120,
        deliveries: 0,
        achievements: [],
      }),
    );
  });

  await bootE2E(page);
  const held = new Set<Arrow>();

  // The seeded distance grants a skill point, and Cipher is not yet owned.
  const start = await readTick(page, 0, 0);
  expect(start.state.skillPoints).toBeGreaterThanOrEqual(1);
  expect(start.state.skills.cipher ?? 0).toBe(0);

  // Open the skills panel and spend a point on Cipher (the fourth skill, key 4).
  // "k" is a toggle, so drive it with setSkillPanel rather than pressUntil (a
  // re-press could flip it back); "4" is a no-op once the point is spent.
  await setSkillPanel(page, true);
  await pressUntil(page, '4', async () => (await readTick(page, 0, 0)).state.skills.cipher === 1);
  expect((await readTick(page, 0, 0)).state.skills.cipher).toBe(1);

  // Close the panel before talking.
  await setSkillPanel(page, false);

  // Drive to the home town and open the postmaster conversation.
  const home = start.state.home;
  await driveToTile(page, held, home.tileX, home.tileY);
  await pressUntil(
    page,
    'e',
    async () => (await readTick(page, home.tileX, home.tileY)).state.dialogueOpen,
  );

  // Navigate greeting -> roads -> letters with real number presses, watching the
  // offered choices change to know which node we are on.
  await pressUntil(page, '1', async () =>
    (await readTick(page, home.tileX, home.tileY)).state.dialogueChoices.some((c) =>
      c.includes('Who would want'),
    ),
  );
  await pressUntil(page, '1', async () =>
    (await readTick(page, home.tileX, home.tileY)).state.dialogueChoices.some((c) =>
      c.includes('read the unsigned letters'),
    ),
  );

  // The Cipher-only line is present on the letters node because the skill is owned.
  const atLetters = await readTick(page, home.tileX, home.tileY);
  expect(atLetters.state.dialogueChoices.some((c) => c.includes('read the unsigned letters'))).toBe(
    true,
  );

  expect(errors, `runtime errors during social-skill run:\n${errors.join('\n')}`).toEqual([]);
});
