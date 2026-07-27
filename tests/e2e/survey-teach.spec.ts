import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, readTick } from './drive';

// #425: the Wayfinder survey ring was live, working, and reaching past the fog,
// and the owner finished a whole arc owning the skill without being able to name
// it. The ring now names itself once, the first time it actually surveys ground
// the courier has not driven.
//
// This is the guard that matters for that fix. The trigger lives in the minimap
// redraw path, so a unit test can prove the predicate is right but not that
// anything calls it: a teach with no caller is invisible and indistinguishable
// from a teach that never fires (trap 1 in CLAUDE.md). Only a real boot shows it.

const SURVEY_FLAG = 'onboarding:survey';

/** Seed a save with the given Wayfinder rank and nothing else. */
async function seedWayfinder(page: import('@playwright/test').Page, rank: number): Promise<void> {
  await page.addInitScript((wayfinder: number) => {
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
        distanceTiles: 0,
        // 20 deliveries is level 5, enough points to hold the seeded rank.
        deliveries: 20,
        achievements: [],
        skills: wayfinder > 0 ? { wayfinder } : {},
        storyFlags: [],
      }),
    );
  }, rank);
}

test('the survey ring names itself once, for a courier who owns Wayfinder', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);

  await seedWayfinder(page, 1);
  await bootE2E(page);

  // The ring surveys unwalked terrain from the spawn, so the teach fires on one
  // of the first redraws without the courier having to drive anywhere.
  await expect
    .poll(async () => (await readTick(page, 0, 0)).state.storyFlags, { timeout: 15_000 })
    .toContain(SURVEY_FLAG);

  expect(errors, `runtime errors during survey teach:\n${errors.join('\n')}`).toEqual([]);
});

test('says nothing to a courier with no Wayfinder, since there is no ring', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);

  await seedWayfinder(page, 0);
  await bootE2E(page);

  // Give the scene the same room to redraw as the test above, then assert the
  // teach stayed silent. Without this the fix could "pass" by naming the ring to
  // everyone, which would be a worse bug than the one being fixed.
  await page.waitForTimeout(3_000);
  const state = (await readTick(page, 0, 0)).state;
  expect(state.skills.wayfinder ?? 0).toBe(0);
  expect(state.storyFlags).not.toContain(SURVEY_FLAG);

  expect(errors, `runtime errors without wayfinder:\n${errors.join('\n')}`).toEqual([]);
});
