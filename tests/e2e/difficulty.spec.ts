import { test, expect } from '@playwright/test';

const DIFFICULTY_KEY = 'courier-of-the-borderlands/difficulty';

// Difficulty is chosen once at the title screen and locked for the run (#150);
// there is no in-run selector. The pure difficulty logic is unit tested; this
// spec guards the scene wiring the units can't reach: the title picker persists
// the choice, MapScene starts on that tuning (the level-1 wagon cap reflects it),
// and the choice survives a reload. Booting with `title=1` forces the picker even
// under the e2e hook (which otherwise skips straight to the map).
test('the title screen picks a difficulty, locks it for the run, and persists it', async ({
  page,
}) => {
  await page.goto('./?e2e=1&title=1');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('#game canvas').click();

  const stored = () => page.evaluate((k) => localStorage.getItem(k), DIFFICULTY_KEY);
  const attached = () => page.evaluate(() => globalThis.__courier !== undefined);
  const condition = () => page.evaluate(() => globalThis.__courier!.getState().wagonCondition);

  // On the title screen: no preference stored yet and the map (with its hook) has
  // not started.
  expect(await stored()).toBeNull();
  expect(await attached()).toBe(false);

  // Pick Demanding (3). Re-press until the map scene attaches, since a single
  // press can drop before the scene is listening under CI load.
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press('3');
    try {
      await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, {
        timeout: 1500,
      });
      break;
    } catch {
      // Not attached yet; press again.
    }
  }
  expect(await attached()).toBe(true);

  // The choice persisted, and the run started on demanding: a fresh level-1
  // demanding wagon caps at 16.
  expect(await stored()).toBe('demanding');
  expect(await condition()).toBe(16);

  // Locked for the run: the retired G selector does nothing.
  await page.keyboard.press('g');
  await page.waitForTimeout(150);
  expect(await condition()).toBe(16);
  expect(await stored()).toBe('demanding');

  // Persists across a reload: a run in progress resumes straight into the map on
  // the same difficulty.
  await page.reload();
  await page.locator('#game canvas').click();
  await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, {
    timeout: 15_000,
  });
  expect(await stored()).toBe('demanding');
  expect(await condition()).toBe(16);
});
