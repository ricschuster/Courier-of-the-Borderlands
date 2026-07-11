import { test, expect } from '@playwright/test';

// The boot-error overlay is a DOM recovery affordance mounted in main.ts, so it
// survives a scene that never started. This drives the real built app, then
// simulates an uncaught script error and asserts the overlay and its reset
// controls appear. It deliberately does not use the ?e2e hook: the overlay lives
// outside Phaser and is exactly what a player sees when the game fails to boot.

test('an uncaught error shows a recovery overlay with reset controls', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });

  // The overlay is absent during a normal, error-free boot.
  await expect(page.locator('#boot-error')).toHaveCount(0);

  // Simulate an uncaught script error; the window handler should raise the overlay.
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'synthetic boot failure' }));
  });

  const overlay = page.locator('#boot-error');
  await expect(overlay).toBeVisible();
  await expect(overlay.getByRole('button', { name: 'Reset save and reload' })).toBeVisible();
  await expect(overlay.getByRole('button', { name: 'Reload without resetting' })).toBeVisible();

  // A second error does not stack a second overlay.
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'again' }));
  });
  await expect(page.locator('#boot-error')).toHaveCount(1);
});
