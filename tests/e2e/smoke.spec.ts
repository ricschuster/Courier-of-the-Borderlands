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
  expect(parsed.regionId).toBe('greybridge');
  expect(parsed.fogByRegion).toBeTruthy();
  expect(Array.isArray(parsed.fogByRegion.greybridge)).toBe(true);
});

test('boots the saltreach region from a save without runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`console: ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });

  // Seed a save pointing at the second region before the game boots.
  await page.addInitScript(() => {
    localStorage.setItem(
      'courier-of-the-borderlands/save',
      JSON.stringify({
        version: 1,
        coins: 100,
        reputation: {},
        unlocks: [],
        upgrades: [],
        completed: [],
        visited: [],
        regionId: 'saltreach',
        fogByRegion: {},
        activeContractId: null,
        contractStatus: null,
        distanceTiles: 0,
        deliveries: 0,
        achievements: [],
      }),
    );
  });

  await page.goto('./');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);

  expect(errors, `runtime errors in saltreach:\n${errors.join('\n')}`).toEqual([]);
  const save = await page.evaluate(() => localStorage.getItem('courier-of-the-borderlands/save'));
  expect(JSON.parse(save ?? '{}').regionId).toBe('saltreach');
});

test('boots the fenmarch region from a save without runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`console: ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });

  // Seed a save pointing at the Fenmarch region before the game boots.
  await page.addInitScript(() => {
    localStorage.setItem(
      'courier-of-the-borderlands/save',
      JSON.stringify({
        version: 1,
        coins: 100,
        reputation: {},
        unlocks: [],
        upgrades: [],
        completed: [],
        visited: [],
        regionId: 'fenmarch',
        fogByRegion: {},
        activeContractId: null,
        contractStatus: null,
        distanceTiles: 0,
        deliveries: 0,
        achievements: [],
      }),
    );
  });

  await page.goto('./');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);

  expect(errors, `runtime errors in fenmarch:\n${errors.join('\n')}`).toEqual([]);
  const save = await page.evaluate(() => localStorage.getItem('courier-of-the-borderlands/save'));
  expect(JSON.parse(save ?? '{}').regionId).toBe('fenmarch');
});
