import { test, expect } from '@playwright/test';

// The boot-error overlay is a DOM recovery affordance mounted in main.ts, so it
// survives a scene that never started. This drives the real built app, then
// simulates an uncaught script error and asserts the overlay and its reset
// controls appear. It deliberately does not use the ?e2e hook: the overlay lives
// outside Phaser and is exactly what a player sees when the game fails to boot.

test('an uncaught error shows a recovery overlay with reset controls', async ({ page }) => {
  await page.goto('./play.html');
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

// #221: the overlay above is deliberately generic ("The road washed out"), so
// without this the detail reached only the console and died with the tab. The
// dashboard reads the log back; this proves the write happens on a real error
// through the real handler, not just that the pure module works.
test('an uncaught error records its detail to the error log', async ({ page }) => {
  await page.goto('./play.html');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });

  const readLog = () =>
    page.evaluate(() => {
      const raw = localStorage.getItem('courier-of-the-borderlands/errors');
      return raw === null ? null : (JSON.parse(raw) as { source: string; message: string; count: number }[]);
    });

  // Nothing logged during a clean boot.
  expect(await readLog()).toBeNull();

  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'synthetic failure', error: new Error('synthetic failure') }));
  });

  const logged = await readLog();
  expect(logged).toHaveLength(1);
  expect(logged![0]!.source).toBe('error');
  expect(logged![0]!.message).toContain('synthetic failure');

  // A repeat collapses into a count rather than flooding the ring, which is what
  // a throw inside the update loop would otherwise do every frame.
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'synthetic failure', error: new Error('synthetic failure') }));
  });
  const repeated = await readLog();
  expect(repeated).toHaveLength(1);
  expect(repeated![0]!.count).toBe(2);

  // An unhandled rejection is logged under its own source.
  await page.evaluate(() => {
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        promise: Promise.reject(new Error('rejected badly')).catch(() => undefined) as Promise<never>,
        reason: new Error('rejected badly'),
      }),
    );
  });
  const withRejection = await readLog();
  expect(withRejection).toHaveLength(2);
  expect(withRejection![1]!.source).toBe('rejection');
  expect(withRejection![1]!.message).toContain('rejected badly');
});
