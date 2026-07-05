import { test, expect } from '@playwright/test';

// Smoke test: confirm the built game actually boots and renders in a real
// browser with no runtime errors. This covers what unit tests cannot: Phaser
// scene setup, physics, and rendering in an actual page.
test('boots and renders the Greybridge map without runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`console: ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });

  await page.goto('./');

  // Phaser mounts its canvas into the #game element.
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  const box = await canvas.boundingBox();
  expect(box, 'canvas should have a bounding box').not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);

  // Let a few update ticks run so any create()/update() error would surface.
  await page.waitForTimeout(1500);

  expect(errors, `runtime errors detected:\n${errors.join('\n')}`).toEqual([]);

  // The game writes a versioned save to localStorage on boot.
  const save = await page.evaluate(() =>
    localStorage.getItem('courier-of-the-borderlands/save'),
  );
  expect(save, 'a save should be written to localStorage').not.toBeNull();
  const parsed = JSON.parse(save ?? '{}');
  expect(parsed.version).toBe(1);
  expect(parsed.fogWidth).toBe(20);
});
