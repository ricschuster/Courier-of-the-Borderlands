import { test, expect } from '@playwright/test';

const DIFFICULTY_KEY = 'courier-of-the-borderlands/difficulty';

// The title picker is now clickable, not keyboard-only (#327): a web player can
// choose a difficulty with the mouse. Clicking the Demanding row must persist
// that choice and start the run on it. The keyboard path and persistence are
// covered by difficulty.spec.ts; this guards the pointer wiring.
test('clicking a difficulty row starts the run on that preset', async ({ page }) => {
  await page.goto('./play.html?e2e=1&title=1');
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  // No preference stored yet and the map (with its hook) has not started.
  expect(await page.evaluate((k) => localStorage.getItem(k), DIFFICULTY_KEY)).toBeNull();

  // The Demanding row is the third of three, centred horizontally. Game space is
  // 960x540; click proportionally within the canvas box. Retry, since a single
  // click can land before the scene is listening under CI load.
  const box = (await canvas.boundingBox())!;
  const px = box.x + box.width * 0.5;
  const py = box.y + box.height * (384 / 540);
  for (let i = 0; i < 10; i += 1) {
    await page.mouse.click(px, py);
    try {
      await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, {
        timeout: 1500,
      });
      break;
    } catch {
      // Not attached yet; click again.
    }
  }

  expect(await page.evaluate(() => globalThis.__courier !== undefined)).toBe(true);
  expect(await page.evaluate((k) => localStorage.getItem(k), DIFFICULTY_KEY)).toBe('demanding');
  // A fresh level-1 demanding wagon caps at 16, proving the run started on it.
  expect(await page.evaluate(() => globalThis.__courier!.getState().wagonCondition)).toBe(16);
});
