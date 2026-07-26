import { test, expect } from '@playwright/test';
import { tapKey, waitForFrames } from './drive';

// Session 5 playtest: the spokes never showed the "Region Cleared" panel that
// Greybridge shows. Cause: the panel was gated on in-play contracts, and each
// spoke's arc-gated contract is revealed (but left undelivered) as the mission
// climax, so delivered < in-play and the panel was suppressed forever.
//
// This seeds a cleared Saltreach with its arc-gated contract revealed and
// undelivered, then reads the e2e hook. The panel is now driven by the standing
// (ungated) routes, so it must be visible even though the gated contract is on
// the board.

const SALTREACH_STANDING = [
  'saltreach-tide-to-reed',
  'saltreach-tide-to-keep',
  'saltreach-tide-to-cormorant',
  'saltreach-cipher-to-saltmere',
];

test('shows the cleared panel on a spoke whose arc-gated contract is revealed but undelivered', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  // Seed a cleared Saltreach: all standing routes delivered and the harbormaster
  // reveal flag set, so the arc-gated contract is on the board but undelivered.
  await page.addInitScript((completed) => {
    localStorage.setItem(
      'courier-of-the-borderlands/save',
      JSON.stringify({
        version: 1,
        coins: 200,
        reputation: { tidewatch: 6 },
        unlocks: [],
        upgrades: [],
        completed,
        visited: [...completed, 'tidewatch', 'reedford', 'saltkeep', 'cormorant-rock', 'saltmere'],
        regionId: 'saltreach',
        fogByRegion: {},
        activeContractId: null,
        contractStatus: null,
        distanceTiles: 0,
        deliveries: completed.length,
        achievements: [],
        storyFlags: ['saltreach_method'],
      }),
    );
  }, SALTREACH_STANDING);

  await page.goto('./play.html?e2e=1');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, { timeout: 15_000 });

  const state = await page.evaluate(() => globalThis.__courier!.getState());

  // The region reads as cleared on its standing routes...
  expect(state.regionCleared).toBe(true);
  // ...the arc-gated contract is revealed on the board (this is what used to
  // suppress the panel)...
  expect(state.availableContractIds).toContain('saltreach-run-the-birds');
  // ...and the cleared panel is shown anyway.
  expect(state.summaryVisible).toBe(true);

  // The panel is up, but nothing was cleared just now: this save loaded into an
  // already-finished region. The cue is announce-gated for exactly that reason
  // (#384), the same way achievements are, so booting must be silent. Without
  // the gate every reload of a finished region would congratulate the player.
  expect(
    state.audio.played,
    `boot into a cleared region should be silent: ${state.audio.played.join(', ')}`,
  ).not.toContain('region-cleared');

  // Esc dismisses the panel, which blocks the centre of the screen, so the
  // player can get back to driving. Added with the #392 extraction: neutralizing
  // the dismissal left all 1120 unit tests and all 49 browser tests green, so
  // the handler could have been deleted outright without a single failure. The
  // capstone's Esc was covered (capstone.spec.ts) and the summary's was not.
  await tapKey(page, 'Escape');
  await waitForFrames(page, 2);
  const dismissed = await page.evaluate(() => globalThis.__courier!.getState());
  expect(dismissed.summaryVisible, 'Esc should dismiss the region-cleared panel').toBe(false);

  expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
