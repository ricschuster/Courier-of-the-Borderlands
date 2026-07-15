import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors } from './drive';

// #227: the juice pass adds screen shake and particle bursts, and a player who
// has asked their OS to reduce motion must not get them.
//
// This drives the real browser preference rather than the pure predicate, which
// is unit tested separately in reduced-motion.test.ts. The two answer different
// questions: the unit test says the function reads the media query correctly,
// this says the game is actually wired to it. The #274 defect was a function with
// no caller, which no unit test could have caught.

test('juice plays by default', async ({ page }) => {
  const errors = collectErrors(page);
  await bootE2E(page);
  const enabled = await page.evaluate(() => globalThis.__courier?.getState().juiceEnabled);
  expect(enabled).toBe(true);
  expect(errors).toEqual([]);
});

test('a reduced-motion preference suppresses juice, and the game still runs', async ({ page }) => {
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await bootE2E(page);

  const enabled = await page.evaluate(() => globalThis.__courier?.getState().juiceEnabled);
  expect(enabled).toBe(false);

  // Suppressed, not broken: the scene boots and runs frames as normal. Juice is
  // cosmetic, so nothing about the run should change.
  const before = await page.evaluate(() => globalThis.__courier?.getFrame() ?? 0);
  await page.waitForFunction(
    (f) => (globalThis.__courier?.getFrame() ?? 0) > f + 5,
    before,
    { timeout: 10_000 },
  );
  expect(errors).toEqual([]);
});
