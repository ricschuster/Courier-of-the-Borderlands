import { test, expect } from '@playwright/test';
import { bootE2E, tapKey } from './drive';

const DIFFICULTY_KEY = 'courier-of-the-borderlands/difficulty';
const SAVE_KEY = 'courier-of-the-borderlands/save';

// The difficulty selector (#135) is pure-logic tested in unit tests; this spec
// guards the scene wiring the units can't reach: the G key cycles the preset,
// persists it, and applies the new tuning live (the wagon's max capacity, and
// so its condition, changes immediately).
test('the G key cycles difficulty, persists it, and applies the tuning live', async ({ page }) => {
  // Clean slate: no save, no stored preference. Clear once after the first boot
  // (not via addInitScript, which would also wipe storage on the later reload).
  await bootE2E(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#game canvas').click();
  await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, { timeout: 15_000 });

  const condition = () => page.evaluate(() => globalThis.__courier!.getState().wagonCondition);
  const stored = () => page.evaluate((k) => localStorage.getItem(k), DIFFICULTY_KEY);

  // Fresh level-1 wagon on standard tuning caps at 25; no preference stored yet.
  expect(await condition()).toBe(25);
  expect(await stored()).toBeNull();

  // G: standard -> demanding (level-1 cap 16). Condition clamps 25 -> 16 live.
  await tapKey(page, 'g');
  await expect.poll(stored).toBe('demanding');
  expect(await condition()).toBe(16);

  // G: demanding -> relaxed (cap 40). Condition stays 16 (a clamp only lowers).
  await tapKey(page, 'g');
  await expect.poll(stored).toBe('relaxed');
  expect(await condition()).toBe(16);

  // G: relaxed -> standard, wrapping the cycle.
  await tapKey(page, 'g');
  await expect.poll(stored).toBe('standard');

  // The preference survives a page load: set demanding, force a fresh new game,
  // reload, and the level-1 cap reflects the persisted difficulty.
  await tapKey(page, 'g');
  await expect.poll(stored).toBe('demanding');
  await page.evaluate((k) => localStorage.removeItem(k), SAVE_KEY);
  await page.reload();
  await page.locator('#game canvas').click();
  await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, { timeout: 15_000 });
  expect(await stored()).toBe('demanding');
  expect(await condition()).toBe(16);
});
