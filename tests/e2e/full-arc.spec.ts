import { test, expect, type Page } from '@playwright/test';
import { bootE2E, collectErrors, driveToTile, travelTo, type Arrow } from './drive';

// End-to-end arc completion: boot the real built game and greedily play the
// whole three-region arc with genuine key presses until the blockade breaks and
// the capstone panel shows. This is the "can the arc still be finished start to
// finish" guard: any regression that soft-locks the critical path (an
// unreachable pickup, a dead gateway, a dialogue that never sets its flag, a
// panel that never dismisses) fails here even when every unit test passes.
//
// It reuses the same read-plus-navigate hook and drive helpers as the other
// specs, so all movement is real input through Phaser. The greedy driver
// mirrors scripts/autoplay.mjs (the screenshotting dev tool); this version just
// asserts the finish instead of capturing images.
//
// This is the heavy guard (~3m of real-time driving), so it does not run on
// every PR: in CI it is skipped unless RUN_ARC is set, which only the dedicated
// nightly / on-merge `arc` job does (a docs or pure-logic PR cannot break the
// arc, and per-PR it would add flake surface for little signal). It still runs
// by default locally, so `npx playwright test full-arc` works as expected.
const arcTest = process.env.CI && !process.env.RUN_ARC ? test.skip : test;

type State = NonNullable<Awaited<ReturnType<typeof readState>>>;

function readState(page: Page) {
  return page.evaluate(() => globalThis.__courier?.getState() ?? null);
}

// Labels that advance the arc (set the reveal / blockade flags). Prefer these.
const PROGRESS = ['answering again', 'both roads are open', 'follow them'];

function pickChoice(choices: readonly string[]): number {
  const lower = choices.map((c) => c.toLowerCase());
  const progress = lower.findIndex((c) => PROGRESS.some((p) => c.includes(p)));
  if (progress !== -1) return progress;
  const nonLoop = lower.findIndex((c) => !c.includes('ask something else'));
  return nonLoop === -1 ? 0 : nonLoop;
}

// Walk a conversation, taking progress choices where offered, until it closes.
async function walkDialogue(page: Page): Promise<void> {
  const seen = new Set<string>();
  for (let i = 0; i < 16; i++) {
    const s = await readState(page);
    if (!s || !s.dialogueOpen) return;
    if (s.dialogueChoices.length === 0) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(120);
      continue;
    }
    const sig = s.dialogueChoices.join('|');
    const hasProgress = s.dialogueChoices.some((c) => PROGRESS.some((p) => c.toLowerCase().includes(p)));
    if (seen.has(sig) && !hasProgress) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(120);
      continue;
    }
    seen.add(sig);
    await page.keyboard.press(String(pickChoice(s.dialogueChoices) + 1));
    await page.waitForTimeout(160);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
}

arcTest('drives the whole arc to the blockade-broken capstone', async ({ page }) => {
  // The full arc is ~20 deliveries across three regions at real driving speed.
  test.setTimeout(300_000);

  const errors = collectErrors(page);
  // Turbo doubles the wagon speed (test-only) so ~20 deliveries at real driving
  // speed finish in about half the wall-clock. Same paths, same input.
  await bootE2E(page, { turbo: true });
  // Start from a clean save so gate/reputation pacing is deterministic.
  await page.evaluate(() => localStorage.removeItem('courier-of-the-borderlands/save'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#game canvas').click();
  await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, { timeout: 15_000 });

  const held = new Set<Arrow>();
  const talked = new Set<string>();     // "region:arcFlags" talk states done
  const triedGateways = new Set<string>();
  const doneRegions = new Set<string>();
  let lastRegion = (await readState(page))!.regionId;

  for (let step = 0; step < 260; step++) {
    const s = (await readState(page)) as State | null;
    if (!s) break;

    if (s.regionId !== lastRegion) {
      lastRegion = s.regionId;
      triedGateways.clear();
    }
    if (s.capstoneVisible) break; // arc complete

    if (s.dialogueOpen) {
      await walkDialogue(page);
      continue;
    }
    if (s.summaryVisible) {
      await page.keyboard.press('Escape'); // the summary panel dismisses on Esc
      await page.waitForTimeout(150);
      continue;
    }

    // Carrying: deliver at the destination.
    if (s.activeContractId && s.contractStatus === 'carrying' && s.destination) {
      await driveToTile(page, held, s.destination.tileX, s.destination.tileY);
      await page.waitForTimeout(250);
      await page.keyboard.press('Space'); // dismiss the delivery toast
      await page.waitForTimeout(100);
      continue;
    }
    // Accepted: drive the pickup leg first (may be a non-home settlement).
    if (s.activeContractId && s.contractStatus === 'accepted' && s.pickup) {
      await driveToTile(page, held, s.pickup.tileX, s.pickup.tileY);
      await page.waitForTimeout(200);
      continue;
    }

    if (s.atHome) {
      // Once the region is cleared, talk to the postmaster: this sets the reveal
      // flag (opening the hidden-road arc contract) and, at Greywater with both
      // spoke reveals known, breaks the blockade. Key on the arc-flag set so the
      // final talk re-fires at the hub once the spoke flags are in.
      const arcFlags = s.storyFlags
        .filter((f) => /reveal|blockade|method|cost/.test(f))
        .sort()
        .join(',');
      const talkKey = `${s.regionId}:${arcFlags}`;
      if (s.regionCleared && !talked.has(talkKey)) {
        talked.add(talkKey);
        await page.keyboard.press('E');
        await page.waitForTimeout(220);
        if ((await readState(page))?.dialogueOpen) await walkDialogue(page);
        continue;
      }
      if (s.availableContractIds.length > 0) {
        await page.keyboard.press('1'); // accept the first offered contract
        await page.waitForTimeout(200);
        continue;
      }
      // Nothing left here: travel to a region we have not exhausted.
      doneRegions.add(s.regionId);
      const gw =
        s.gateways.find((g) => !doneRegions.has(g.to) && !triedGateways.has(`${s.regionId}->${g.to}`)) ??
        s.gateways.find((g) => !triedGateways.has(`${s.regionId}->${g.to}`));
      if (!gw) break;
      triedGateways.add(`${s.regionId}->${gw.to}`);
      await travelTo(page, held, gw.tileX, gw.tileY, s.regionId, gw.to);
      continue;
    }

    // Not home, no contract in hand: head to the home town.
    await driveToTile(page, held, s.home.tileX, s.home.tileY);
  }

  const end = (await readState(page)) as State;
  // The arc resolved: the blockade broke and the capstone panel is showing.
  expect(end.storyFlags).toContain('blockade_broken');
  expect(end.capstoneVisible).toBe(true);
  // Every settlement in the home region is reconnected (or home).
  for (const status of Object.values(end.worldState)) {
    expect(['home', 'reconnected']).toContain(status);
  }
  expect(errors, `runtime errors during the arc:\n${errors.join('\n')}`).toEqual([]);
});
