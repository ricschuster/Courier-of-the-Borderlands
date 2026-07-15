import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, pressUntil } from './drive';

// #274: the journal, skills, and upgrade overlays could only be scrolled with a
// mouse wheel. Every other interaction in the game is a keystroke, so a
// keyboard-only player could open the journal, see "scroll down to read more",
// and have no way to comply.
//
// This is an integration test on purpose. The defect was not bad logic, it was
// that MapHud.handleScroll had no keyboard caller at all, so only driving real
// key presses through Phaser proves the wiring exists. The scroll offset is read
// through the e2e hook because the panel renders to canvas and its text cannot be
// read from the DOM.

const JOURNAL_KEY = 'j';

async function scrollOffset(page: import('@playwright/test').Page): Promise<number | null> {
  return page.evaluate(() => globalThis.__courier?.getState().overlayScrollOffset ?? null);
}

test('the journal scrolls with PgUp/PgDn, not just the wheel', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);

  // Seed a save with a long history so the journal overflows its panel and there
  // is something to scroll to. A fresh save's journal can fit on one screen, and
  // a panel whose content fits would make this test vacuous.
  await page.addInitScript(() => {
    localStorage.setItem(
      'courier-of-the-borderlands/save',
      JSON.stringify({
        version: 1,
        coins: 400,
        reputation: { greybridge: 12, ashford: 8, mirewatch: 6 },
        unlocks: [],
        upgrades: [],
        completed: [
          'greybridge-letters-to-ashford',
          'greybridge-salt-to-mirewatch',
          'greybridge-rumour-to-fenmarch',
        ],
        visited: ['greybridge', 'ashford', 'mirewatch'],
        regionId: 'greybridge',
        fogByRegion: {},
        activeContractId: null,
        contractStatus: null,
        distanceTiles: 240,
        deliveries: 3,
      }),
    );
  });

  await bootE2E(page);

  // No scrollable overlay is open at boot, so there is no offset to read.
  expect(await scrollOffset(page)).toBeNull();

  // Open the journal. A one-shot press can be dropped between starved frames, so
  // press until the overlay actually reports an offset.
  await pressUntil(page, JOURNAL_KEY, async () => (await scrollOffset(page)) !== null);
  expect(await scrollOffset(page)).toBe(0);

  // PgDn moves the content. This is the assertion that fails without #274's fix:
  // before it, no key was bound and the offset stayed pinned at 0 forever.
  await pressUntil(page, 'PageDown', async () => ((await scrollOffset(page)) ?? 0) > 0);
  const scrolled = await scrollOffset(page);
  expect(scrolled).toBeGreaterThan(0);

  // PgUp returns to the top and clamps there rather than running negative.
  await pressUntil(page, 'PageUp', async () => (await scrollOffset(page)) === 0);
  expect(await scrollOffset(page)).toBe(0);

  expect(errors).toEqual([]);
});
