import { test, expect, type Page } from '@playwright/test';
import {
  bootE2E,
  buyAffordableUpgrades,
  collectErrors,
  driveToTile,
  pressUntil,
  seatAt,
  setSkillPanel,
  tapKey,
  travelTo,
  waitForFrames,
  type Arrow,
} from './drive';

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
      await tapKey(page, 'Escape');
      await waitForFrames(page, 2);
      continue;
    }
    const sig = s.dialogueChoices.join('|');
    const hasProgress = s.dialogueChoices.some((c) => PROGRESS.some((p) => c.toLowerCase().includes(p)));
    if (seen.has(sig) && !hasProgress) {
      await tapKey(page, 'Escape');
      await waitForFrames(page, 2);
      continue;
    }
    seen.add(sig);
    await tapKey(page, String(pickChoice(s.dialogueChoices) + 1));
    await waitForFrames(page, 2);
  }
  await tapKey(page, 'Escape');
  await waitForFrames(page, 2);
}

// Spend coins and skill points the way a completionist player would, so the buy
// and rank input flows stay covered by the arc guard and gated content (the mire
// shortcut that Off-road rank 2 opens) becomes reachable in the arc. Number keys
// select skills in panel order: 1 Wayfinder, 2 Off-road, 3 Negotiator, 4 Cipher
// (see src/systems/skills.ts). Returns true if anything was bought or ranked, so
// the caller re-reads before its next move. Bounded: coins and points are finite
// and a maxed skill or unaffordable shop ignores the press, so once there is
// nothing left to spend it returns false and the caller falls through to arc
// progress.
async function spendAtHome(page: Page): Promise<boolean> {
  // Make sure the panel is closed before reading the board: the contract-accept
  // handler ignores number keys while the skill panel is open, so a panel left
  // open by an earlier visit would silently swallow every "1" and stall the arc.
  // setSkillPanel confirms the state (a raw "k" toggle can drop under load).
  await setSkillPanel(page, false);
  const before = await readState(page);
  if (!before) return false;

  // Kit out the wagon: open the upgrade menu ("B") and buy every affordable
  // upgrade by number key, then close it (a no-op when none is affordable).
  await buyAffordableUpgrades(page);

  // Repair the wagon at home (travel sink, ADR 0005). A no-op when already full
  // or broke. Keeps the driver from stranding at 0 condition (limp speed), and
  // the coins it spends are the recurring sink the mechanic exists to create.
  await tapKey(page, 'R');
  await waitForFrames(page, 2);

  if (before.skillPoints > 0) {
    await setSkillPanel(page, true);
    // Off-road first (it opens the mire), then the rest, one point per key.
    for (const key of ['2', '1', '3', '4']) {
      await tapKey(page, key);
      await waitForFrames(page, 2);
    }
    // Close it before returning so the number keys reach the contract board.
    await setSkillPanel(page, false);
  }

  const after = await readState(page);
  if (!after) return false;
  return after.upgrades.length > before.upgrades.length || after.skillPoints < before.skillPoints;
}

// Drive to a tile, recovering if the wagon strands en route. The travel sink
// (ADR 0005) drops the wagon to limp speed (0.15x) the instant condition hits 0,
// and under a loaded CI runner a long leg can drain it mid-drive, leaving
// driveToTile unable to crawl the rest within its step budget ("courier stuck").
// A stranded wagon can pay for a tow home (R off a settlement), so on a stuck
// strand we tow home and repair (R on the home settlement), and the caller then
// re-approaches on a full wagon. A stuck wagon that is NOT stranded is a genuine
// unreachable-tile regression, so that re-throws untouched.
async function driveOrRecover(
  page: Page,
  held: Set<Arrow>,
  x: number,
  y: number,
): Promise<void> {
  try {
    await driveToTile(page, held, x, y);
  } catch (err) {
    if (!/courier stuck|no path/.test(String(err))) throw err;
    const st = await readState(page);
    if (!st || st.wagonCondition > 0) throw err;
    await tapKey(page, 'R'); // tow home (stranded off a settlement)
    await waitForFrames(page, 2);
    await tapKey(page, 'R'); // repair on the home tile so the retry is not dry
    await waitForFrames(page, 2);
  }
}

arcTest('drives the whole arc to the blockade-broken capstone', async ({ page }) => {
  // The full arc is ~20 deliveries across three regions. With turbo it runs in
  // ~3m locally, but a loaded CI runner (or a busy dev machine) throttles the
  // frame loop and slows the drive, so give generous headroom over the clean
  // time to keep this a signal about the game, not about runner load.
  test.setTimeout(720_000);

  const errors = collectErrors(page);
  // Turbo doubles the wagon speed (test-only) so ~20 deliveries at real driving
  // speed finish in about half the wall-clock. Same paths, same input. noWear
  // disables travel-sink wear: this arc guards reachability / soft-locks, and a
  // wagon drained to limp speed mid-leg under CI load reads as a false stall
  // (the sink is unit tested separately and cannot soft-lock).
  await bootE2E(page, { turbo: true, noWear: true });
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
  // No-progress watchdog: track a signature of every marker that changes as the
  // arc advances, and fail loudly if it stays flat for too long.
  let progressSig = '';
  let stallSteps = 0;

  // A clean run needs ~100 macro-steps; the generous budget is headroom for
  // dropped-input retries under a loaded runner.
  for (let step = 0; step < 400; step++) {
    const s = (await readState(page)) as State | null;
    if (!s) break;

    // If nothing that marks arc progress changes for many steps, the driver is
    // wedged on an input the game keeps ignoring (e.g. a panel swallowing the
    // contract-accept key). Fail with the live state so the cause is obvious,
    // rather than running out the step budget and reporting a missing flag.
    // Deliberately excludes atHome: the wagon can coast on and off the home tile
    // between iterations while retrying an input, and that toggle alone must not
    // read as progress or the watchdog never trips on a genuine stall.
    const sig = [
      s.regionId,
      s.storyFlags.length,
      s.contractStatus,
      s.activeContractId ?? '',
      Object.values(s.worldState).join(''),
    ].join('|');
    if (sig === progressSig) {
      stallSteps++;
      if (stallSteps >= 60) {
        throw new Error(
          `arc stalled for ${stallSteps} steps: ${JSON.stringify({
            region: s.regionId,
            storyFlags: s.storyFlags,
            contractStatus: s.contractStatus,
            atHome: s.atHome,
            skillPanelOpen: s.skillPanelOpen,
            availableContracts: s.availableContractIds.length,
            courier: [s.courier.tileX, s.courier.tileY],
          })}`,
        );
      }
    } else {
      progressSig = sig;
      stallSteps = 0;
    }

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
      await tapKey(page, 'Escape'); // the summary panel dismisses on Esc
      await waitForFrames(page, 2);
      continue;
    }

    // Carrying: deliver at the destination.
    if (s.activeContractId && s.contractStatus === 'carrying' && s.destination) {
      await driveOrRecover(page, held, s.destination.tileX, s.destination.tileY);
      await waitForFrames(page, 2); // delivery fires per frame on the tile
      await tapKey(page, 'Space'); // dismiss the delivery toast
      await waitForFrames(page, 2);
      continue;
    }
    // Accepted: drive the pickup leg first (may be a non-home settlement).
    if (s.activeContractId && s.contractStatus === 'accepted' && s.pickup) {
      await driveOrRecover(page, held, s.pickup.tileX, s.pickup.tileY);
      await waitForFrames(page, 2); // pickup fires per frame on the tile
      continue;
    }

    // No active contract in hand: do home business. The wagon coasts a tile or
    // two past the home settlement when a drive ends (further under a loaded CI
    // frame loop), so a post-coast atHome read cannot gate this and a fixed tile
    // threshold just moves the cliff. Instead always re-seat onto the home tile
    // and act in the same iteration, before the next coast (the talk branch
    // already does this). Reaching here at all means no pickup or delivery leg is
    // pending, so heading home is unconditionally correct.
    await driveOrRecover(page, held, s.home.tileX, s.home.tileY);
    // Settle exactly onto the home tile: the drive can end with residual
    // velocity that carries the wagon off it before the next frame, and the
    // shop/repair/board inputs below are all exact-tile gated.
    await seatAt(page, s.home.tileX, s.home.tileY);
    // Spend coins and skill points (a real player kits out at home). Bounded, so
    // it stops once broke.
    if (await spendAtHome(page)) continue;
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
      // Settle back onto the home tile (the wagon does not move during
      // spendAtHome, but seat is cheap and makes the E press's exact-tile gate
      // certain), then press E. Only mark the talk done once the dialogue
      // actually opened: a missed press then just retries on the next loop
      // instead of being marked done without happening, which would otherwise
      // leave the final blockade talk unfired.
      await seatAt(page, s.home.tileX, s.home.tileY);
      await tapKey(page, 'E');
      await waitForFrames(page, 2);
      if ((await readState(page))?.dialogueOpen) {
        talked.add(talkKey);
        await walkDialogue(page);
      }
      continue;
    }
    if (s.availableContractIds.length > 0) {
      // Settle onto the home tile, then press 1 until the game confirms the
      // accept (activeContractId set). The board only takes the key while the
      // wagon is standing on the settlement; seated with no movement keys held,
      // the wagon stays put between attempts, so the confirm loop cannot race
      // the coast the way a fire-and-forget press could.
      await seatAt(page, s.home.tileX, s.home.tileY);
      await pressUntil(page, '1', async () => {
        const now = await readState(page);
        return now !== null && now.activeContractId !== null;
      });
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
  }

  const end = (await readState(page)) as State;
  // The arc resolved: the blockade broke and the capstone panel is showing.
  expect(end.storyFlags).toContain('blockade_broken');
  expect(end.capstoneVisible).toBe(true);
  // Every settlement in the home region is reconnected (or home).
  for (const status of Object.values(end.worldState)) {
    expect(['home', 'reconnected']).toContain(status);
  }
  // The driver spent like a player: it bought at least one upgrade and ranked
  // Off-road (which also opens the mire shortcut), so the buy and rank input
  // flows stay covered by this guard as gates spread to more content.
  expect(end.upgrades.length).toBeGreaterThan(0);
  expect(end.skills['off-road'] ?? 0).toBeGreaterThan(0);
  expect(errors, `runtime errors during the arc:\n${errors.join('\n')}`).toEqual([]);
});
