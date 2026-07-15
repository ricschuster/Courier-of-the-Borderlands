import { test, type Page } from '@playwright/test';
import {
  bootE2E,
  driveToTile,
  setSkillPanel,
  tapKey,
  waitForFrames,
  type Arrow,
} from './drive';

// Screenshot generator (NOT a guard). Boots the real built game, plays a short
// route with genuine key presses, and writes the marketing shots used by
// index.html and README.md into assets/screenshots/.
//
// It lives here rather than in scripts/shot.mjs because a good shot needs a
// *played* state: the boot screen is all fog and intro overlay, and the fog is
// the thing worth showing. Reusing the drive helpers is the cheap way to get a
// real route behind the wagon rather than hand-seeding a save.
//
// Opt-in only: skipped unless SHOTS is set, so it never runs in a normal
// `npm run test:e2e` or in CI. The output is committed art, not an assertion,
// and regenerating it on every run would churn the diff.
//
//   SHOTS=1 npx playwright test screenshots --project=chromium
//
// Re-run it when the HUD, palette, or Greybridge layout changes enough that the
// committed shots misrepresent the game. Check the PNGs in with the change.
const shotTest = process.env.SHOTS ? test : test.skip;

const OUT = 'assets/screenshots';

// Greybridge landmarks. Greywater (home) is the spawn. The route runs north to
// Northcairn, back east over the main bridge to Eastwatch, then south to
// Southmill, which burns fog off a tall wedge of the east bank rather than a
// single thin corridor. The camera window is 20x11 tiles of a 30x22 map, so a
// one-leg drive leaves most of the frame black; the hero is framed mid-route on
// the east-bank road, where fog has been cleared both north and south of the
// wagon and the unrevealed ground still reads as somewhere left to go.
const NORTHCAIRN = { x: 5, y: 3 };
const EASTWATCH = { x: 19, y: 8 };
const SOUTHMILL = { x: 21, y: 14 };
const HERO_VANTAGE = { x: 19, y: 11 };

async function dismissIntro(page: Page): Promise<void> {
  // The intro message box covers most of the frame on a fresh save.
  await tapKey(page, 'Space');
  await waitForFrames(page, 2);
}

shotTest('captures the landing-page screenshots', async ({ page }) => {
  test.setTimeout(300_000);

  await bootE2E(page, { turbo: true, noWear: true });
  await page.evaluate(() => localStorage.removeItem('courier-of-the-borderlands/save'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#game canvas').click();
  await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, {
    timeout: 15_000,
  });
  await dismissIntro(page);

  const held = new Set<Arrow>();

  // Drive a real route so the fog behind the wagon is genuinely revealed.
  await driveToTile(page, held, NORTHCAIRN.x, NORTHCAIRN.y);
  await dismissIntro(page);
  await driveToTile(page, held, EASTWATCH.x, EASTWATCH.y);
  await dismissIntro(page);
  await driveToTile(page, held, SOUTHMILL.x, SOUTHMILL.y);
  await dismissIntro(page);

  // Spend the level-2 skill point. Two reasons: it clears the "1 skill point to
  // spend" toast that otherwise sits in the top-right of every shot (and lands
  // on top of the codex panel), and it means the skills shot shows a real
  // invested rank instead of a wall of 0/3.
  await setSkillPanel(page, true);
  await waitForFrames(page, 2);
  await tapKey(page, '2'); // Off-road: the skill the roads-gate design leans on.
  await waitForFrames(page, 2);
  await page.locator('#game canvas').screenshot({ path: `${OUT}/skills.png` });
  await setSkillPanel(page, false);

  // Back north to the hero vantage, mid-route with fog cleared on both sides.
  await driveToTile(page, held, HERO_VANTAGE.x, HERO_VANTAGE.y);
  await dismissIntro(page);
  await waitForFrames(page, 2);

  // Hero: a partly revealed map with the road, terrain, and HUD in frame.
  await page.locator('#game canvas').screenshot({ path: `${OUT}/exploring.png` });

  // Terrain codex: what the ground costs you.
  await tapKey(page, 'L');
  await waitForFrames(page, 3);
  await page.locator('#game canvas').screenshot({ path: `${OUT}/codex.png` });
  await tapKey(page, 'L');
});
