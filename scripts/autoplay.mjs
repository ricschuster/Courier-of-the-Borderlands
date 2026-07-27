// Autonomous playthrough driver. Boots the real built game with ?e2e, then
// greedily plays the delivery loop across regions using genuine key presses,
// reading state and pathfinding via window.__courier. Logs every action and
// screenshots milestones. Modeled on scripts/shot.mjs for server bootstrap.
//
//   npm run autoplay [-- --no-build]
//
// This is a diagnostic tool, not a gate. The three arc drivers divide up as:
//
//   full-arc.spec.ts            pass/fail gate, wear off, runs post-merge in CI
//   travel-sink-measure.spec.ts economics, wear on, repairs, opt-in MEASURE_DIFF
//   autoplay.mjs (this)         watch it play: screenshots + a readable log
//
// It runs with wear off, so treat the coins in its log as flow, not economics.

import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = 4175; // one off shot.mjs (4174) so the two can run side by side
const BASE = `http://localhost:${PORT}/Courier-of-the-Borderlands/`;
const ROOT = new URL('..', import.meta.url).pathname;
const OUT = `${ROOT}tmp-autoplay`;
const skipBuild = process.argv.includes('--no-build');

const REACH = 12;
const log = [];
function record(msg, extra) {
  const line = extra ? `${msg} ${JSON.stringify(extra)}` : msg;
  log.push(line);
  console.log(line);
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* server not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('preview server did not start');
}

const state = (page) => page.evaluate(() => globalThis.__courier?.getState() ?? null);

// Wait until the game's update loop has advanced by `frames`, so a wait means
// "the game actually ran" rather than "some wall-clock time passed". Tolerates
// the hook being briefly absent during a region-travel scene restart.
async function waitForFrames(page, frames, timeoutMs = 15000) {
  const start = await page.evaluate(() => globalThis.__courier?.getFrame() ?? null);
  if (start === null) {
    await page.waitForFunction(() => globalThis.__courier !== undefined, undefined, { timeout: timeoutMs });
    return waitForFrames(page, frames, timeoutMs);
  }
  await page.waitForFunction(
    (arg) => {
      const api = globalThis.__courier;
      return api !== undefined && api.getFrame() >= arg.from + arg.n;
    },
    { from: start, n: frames },
    { timeout: timeoutMs },
  );
}

// Press a one-shot key by HOLDING it across game frames, not as an instant tap.
//
// The game reads one-shot inputs (accept, talk, buy, dismiss) with JustDown and
// Phaser clears the pending flag on keyup, so a zero-gap down+up that lands
// between two starved frames is silently lost. page.keyboard.press() is exactly
// that shape, which is why the old accept loop had to hammer the digit and still
// missed: it was not being refused, its keypresses were never observed (#440).
// Holding until the frame counter advances guarantees a frame saw the key down.
// Safe because JustDown fires once per down-transition, so a held key acts once.
// This mirrors tapKey in tests/e2e/drive.ts, which exists for the same reason.
// Unlike the test helper this one never throws: a stalled frame loop is a real
// failure in a spec, but this is a diagnostic tool and a crash here would lose
// the log that explains what went wrong. It degrades to a timed hold instead.
async function tapKey(page, key) {
  await page.keyboard.down(key);
  try {
    await waitForFrames(page, 2);
  } catch {
    await page.waitForTimeout(120);
  } finally {
    await page.keyboard.up(key);
  }
}
const nextStep = (page, x, y) =>
  page.evaluate((g) => globalThis.__courier?.nextStepToward(g.x, g.y) ?? null, { x, y });

function desiredKeys(courier, target) {
  const want = new Set();
  if (target.x - courier.x > REACH) want.add('ArrowRight');
  else if (courier.x - target.x > REACH) want.add('ArrowLeft');
  if (target.y - courier.y > REACH) want.add('ArrowDown');
  else if (courier.y - target.y > REACH) want.add('ArrowUp');
  return want;
}
async function applyKeys(page, held, want) {
  for (const k of held) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
}
const releaseAll = (page, held) => applyKeys(page, held, new Set());

// Drive toward a goal tile for up to maxSteps physics windows. Returns 'arrived',
// 'dialogue' (a modal opened), or 'stuck'.
async function driveToTile(page, held, gx, gy, maxSteps = 220) {
  for (let i = 0; i < maxSteps; i++) {
    const s = await state(page);
    if (!s) { await releaseAll(page, held); return 'stuck'; }
    if (s.courier.tileX === gx && s.courier.tileY === gy) { await releaseAll(page, held); return 'arrived'; }
    if (s.dialogueOpen) { await releaseAll(page, held); return 'dialogue'; }
    const next = await nextStep(page, gx, gy);
    if (!next) { await releaseAll(page, held); return 'stuck'; }
    await applyKeys(page, held, desiredKeys(s.courier, next));
    await page.waitForTimeout(80);
  }
  await releaseAll(page, held);
  return 'stuck';
}

// Labels that advance the arc (set reveal / blockade flags). Prefer these.
const PROGRESS = ['answering again', 'both roads are open', 'i will follow them', 'then i will follow'];
// Choose the best choice index for a node: a progress label if present, else the
// first choice that is not the "Ask something else" loop, else index 0.
function pickChoice(choices) {
  const lower = choices.map((c) => c.toLowerCase());
  for (let i = 0; i < lower.length; i++) if (PROGRESS.some((p) => lower[i].includes(p))) return i;
  for (let i = 0; i < lower.length; i++) if (!lower[i].includes('ask something else')) return i;
  return 0;
}

// Walk a conversation, taking progress choices where offered, until it closes or
// we hit the step cap (then bail with Escape). Records flags gained.
async function walkDialogue(page, before) {
  const seen = new Set();
  for (let i = 0; i < 16; i++) {
    const s = await state(page);
    if (!s || !s.dialogueOpen) break;
    if (s.dialogueChoices.length === 0) { await tapKey(page, 'Escape'); await page.waitForTimeout(120); continue; }
    const sig = s.dialogueChoices.join('|');
    // If we loop back to a node we've already resolved, exit rather than spin.
    if (seen.has(sig) && !s.dialogueChoices.some((c) => PROGRESS.some((p) => c.toLowerCase().includes(p)))) {
      await tapKey(page, 'Escape'); await page.waitForTimeout(120); continue;
    }
    seen.add(sig);
    await tapKey(page, String(pickChoice(s.dialogueChoices) + 1));
    await page.waitForTimeout(160);
  }
  let s = await state(page);
  if (s && s.dialogueOpen) { await tapKey(page, 'Escape'); await page.waitForTimeout(120); s = await state(page); }
  const gained = s ? s.storyFlags.filter((f) => !before.includes(f)) : [];
  if (gained.length) record('  dialogue set flags', gained);
  return gained;
}

// Ensure the skills panel is closed so number keys reach the contract board.
async function closeSkillPanel(page) {
  for (let i = 0; i < 3; i++) {
    const s = await state(page);
    if (!s || !s.skillPanelOpen) return;
    await tapKey(page, 'k');
    await page.waitForTimeout(120);
  }
}

// Ensure the upgrade menu is closed so number keys reach the contract board.
// handleBoardInput() ignores number keys while the menu is open, so a menu left
// open silently swallows every contract accept.
async function closeUpgradeMenu(page) {
  for (let i = 0; i < 3; i++) {
    const s = await state(page);
    if (!s || !s.upgradeMenuOpen) return;
    await tapKey(page, 'B');
    await page.waitForTimeout(120);
  }
}

// Buy every upgrade we can afford, cheapest first. Since #161 "B" opens a menu
// rather than buying outright: number keys 1..N buy UPGRADES_GREYBRIDGE[i] while
// it is open, and an unaffordable or owned entry just toasts. So walk all seven
// entries and let the game reject the ones we cannot take. The menu must be
// closed again before the caller presses a number at the board.
async function buyUpgradesAtHome(page) {
  await tapKey(page, 'B');
  await page.waitForTimeout(150);
  const opened = await state(page);
  if (!opened || !opened.upgradeMenuOpen) return;
  for (const key of ['1', '2', '3', '4', '5', '6', '7']) {
    await tapKey(page, key);
    await page.waitForTimeout(110);
  }
  await closeUpgradeMenu(page);
}

// Spend coins and skill points the way a completionist plays: fit every upgrade
// we can afford and rank skills (Off-road first, which opens the mire), so the
// buy/rank flows are exercised and gated content is reachable. Number keys
// select skills in panel order: 1 Wayfinder, 2 Off-road, 3 Negotiator, 4 Cipher.
// Returns true if anything was bought or ranked so the caller re-reads. Bounded:
// finite coins/points, and maxed skills / an unaffordable shop ignore presses.
async function spendAtHome(page) {
  await closeSkillPanel(page);
  const before = await state(page);
  if (!before) return false;

  await buyUpgradesAtHome(page);

  if (before.skillPoints > 0) {
    await tapKey(page, 'k');
    await page.waitForTimeout(120);
    const opened = await state(page);
    if (opened && opened.skillPanelOpen) {
      for (const key of ['2', '1', '3', '4']) {
        await tapKey(page, key);
        await page.waitForTimeout(110);
      }
      await closeSkillPanel(page);
    }
  }

  const after = await state(page);
  if (!after) return false;
  const bought = after.upgrades.length > before.upgrades.length;
  const ranked = after.skillPoints < before.skillPoints;
  if (bought) record('  bought upgrade', { upgrades: after.upgrades, coins: after.coins });
  if (ranked) record('  ranked skill', { skills: after.skills, points: after.skillPoints });
  return bought || ranked;
}

// Accept the board contract in `slot` (1-based), verifying each half.
//
// The board arms on the first press of a slot and accepts only on a confirming
// second press of the same slot (#321), so one press never accepts. It is also
// easy to lose a press entirely: an open panel makes handleBoardInput ignore
// number keys, and a key can drop under load.
//
// The old driver pressed the digit once per loop iteration and checked nothing,
// so a slot that would not take simply logged "accepting X" and tried again,
// burning one step of the budget each time until the run ended early three
// regions in. That is #440, and it is why the log looked like a stall rather
// than a failure: every line was an attempt, none was an error.
//
// Returns 'accepted', 'unavailable' (never armed), or 'refused' (armed but
// would not confirm).
async function acceptSlot(page, slot, expectedId) {
  const key = String(slot);
  let armed = false;
  for (let i = 0; i < 6 && !armed; i++) {
    await tapKey(page, key);
    const s = await state(page);
    if (!s) return 'unavailable';
    // A very fast arm+confirm can land inside one iteration; take the win.
    if (s.activeContractId === expectedId) return 'accepted';
    armed = s.armedContractId === expectedId;
  }
  if (!armed) return 'unavailable';

  for (let i = 0; i < 6; i++) {
    await tapKey(page, key);
    const s = await state(page);
    if (!s) return 'refused';
    if (s.activeContractId === expectedId) return 'accepted';
  }
  return 'refused';
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  record(`  [screenshot ${name}.png]`);
}

if (!skipBuild) execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT, detached: true, stdio: 'ignore',
});

let browser;
try {
  await waitForServer(BASE);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  // Fresh game every run. `nowear` for the same reason full-arc.spec.ts uses it:
  // this driver never repairs, so with the travel sink on it wears to 0, limps at
  // 0.15x, and strands partway through Greybridge instead of showing the arc. The
  // cost is that the coins in the log below are not real economics (no repair
  // bills). travel-sink-measure.spec.ts is the tool that models wear and repairs.
  await page.goto(`${BASE}play.html?e2e&nowear`, { waitUntil: 'networkidle' });
  // eslint-disable-next-line no-undef -- runs in the browser page, not node
  await page.evaluate(() => localStorage.removeItem('courier-of-the-borderlands/save'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => globalThis.__courier !== undefined, { timeout: 15000 });
  await page.waitForTimeout(300);
  await page.mouse.click(480, 300);

  const held = new Set();
  const s0 = await state(page);
  record('START', { region: s0.regionId, coins: s0.coins, rep: s0.reputation, level: s0.level });
  await shot(page, '00-start');

  let deliveries = 0;
  let lastRegion = s0.regionId;
  const talkedAtHome = new Set();     // "region:arcFlags" talk states already done
  const triedGateways = new Set();    // "region->to" we've already attempted this visit
  const doneRegions = new Set();      // regions with nothing left to do right now
  const summariesSeen = new Set();    // regions whose cleared-summary we've logged/shot
  const unacceptable = new Set();     // contract ids the board would not give us this visit

  // Four regions since Ashmoor closed the world into a ring, and the driver only
  // reaches the fourth after finishing the other three, so the budget has to
  // cover the whole ring rather than the old three-region chain (#440).
  for (let step = 0; step < 400; step++) {
    const s = await state(page);
    if (!s) { record('state hook lost'); break; }

    if (s.regionId !== lastRegion) {
      record(`ENTER region ${s.regionId}`, { coins: s.coins, rep: s.reputation, level: s.level });
      await shot(page, `region-${s.regionId}`);
      lastRegion = s.regionId;
      triedGateways.clear();
      // A contract the board refused elsewhere may well be offerable here, and
      // standing rises between visits, so the skip list is per region visit.
      unacceptable.clear();
    }

    if (s.capstoneVisible) {
      record('CAPSTONE reached — arc complete', { deliveries: s.deliveries, coins: s.coins, rep: s.reputation, level: s.level });
      await shot(page, 'zz-capstone');
      break;
    }
    if (s.dialogueOpen) { await walkDialogue(page, s.storyFlags); continue; }
    if (s.summaryVisible) {
      if (!summariesSeen.has(s.regionId)) { summariesSeen.add(s.regionId); record('region-cleared summary shown', { region: s.regionId }); await shot(page, `summary-${s.regionId}`); }
      await tapKey(page, 'Escape'); // the summary panel dismisses on Esc, not Space
      await page.waitForTimeout(150);
      continue;
    }

    // Carrying: deliver.
    if (s.activeContractId && s.contractStatus === 'carrying' && s.destination) {
      const r = await driveToTile(page, held, s.destination.tileX, s.destination.tileY);
      if (r === 'arrived') {
        await page.waitForTimeout(300);
        const after = await state(page);
        if (after.deliveries > deliveries) {
          deliveries = after.deliveries;
          record(`DELIVERED ${s.activeContractId}`, { deliveries, coins: after.coins, rep: after.reputation, level: after.level, world: after.worldState });
        }
        await tapKey(page, 'Space'); // dismiss delivery toast
        await page.waitForTimeout(120);
      } else if (r === 'dialogue') {
        continue;
      } else {
        record(`  stuck driving to destination of ${s.activeContractId}`);
        await shot(page, `stuck-${step}`);
        break;
      }
      continue;
    }

    // Accepted but not carrying: drive to the pickup leg first.
    if (s.activeContractId && s.contractStatus === 'accepted' && s.pickup) {
      const r = await driveToTile(page, held, s.pickup.tileX, s.pickup.tileY);
      if (r === 'dialogue') continue;
      if (r !== 'arrived') { record(`  stuck driving to pickup of ${s.activeContractId}`); await shot(page, `stuck-pickup-${step}`); break; }
      await page.waitForTimeout(200);
      record(`  picked up ${s.activeContractId} at (${s.pickup.tileX},${s.pickup.tileY})`);
      continue;
    }
    if (s.activeContractId && s.contractStatus === 'accepted') {
      record(`  active contract ${s.activeContractId} has no pickup tile; stopping`);
      await shot(page, `pickup-limit-${step}`);
      break;
    }

    // No active contract.
    if (s.atHome) {
      // Kit out at home first: spend coins and skill points, then re-read.
      if (await spendAtHome(page)) continue;
      // Open the ford before working the board, not after (#444).
      //
      // It used to be the last thing done in a region, after the final delivery
      // had already cleared it. The game shows the cleared panel the moment the
      // last standing contract lands, and this driver screenshots that panel on
      // the same frame, so every summary-<region>.png reported "Ford shortcut:
      // not opened" on runs that opened the ford seconds later. The screenshots
      // are this tool's headline artifact, so its most visible output was
      // describing a run that did not happen.
      //
      // Doing it first fixes the artifact by making the claim true rather than
      // by re-photographing it, and it is closer to how a person plays: the
      // shortcut is worth having while there are still deliveries to run over
      // it, which also means the region's routing actually exercises the ford.
      if (s.signpost && !s.fordUnlocked) {
        record(`driving to signpost to unlock ford in ${s.regionId}`);
        await driveToTile(page, held, s.signpost.tileX, s.signpost.tileY);
        continue;
      }
      // Once the region's standing work is cleared, talk to the postmaster: this
      // is what sets the reveal flag (opening the hidden-road arc contract) and,
      // at Greywater with both spokes revealed, breaks the blockade. Key the talk
      // on the current arc-flag set so it re-fires at the hub when a spoke reveal
      // has since been gained (the final blockade talk), but not on a bare loop.
      // Include the spoke reveal flags (saltreach_method, fenmarch_cost) and the
      // blockade flag: the final Greywater talk is gated on the spoke flags, so
      // they must change the key or the talk never re-fires at the hub.
      const arcFlags = s.storyFlags
        .filter((f) => /reveal|blockade|method|cost/.test(f))
        .sort()
        .join(',');
      const talkKey = `${s.regionId}:${arcFlags}`;
      if (s.regionCleared && !talkedAtHome.has(talkKey)) {
        talkedAtHome.add(talkKey);
        record(`region ${s.regionId} cleared; talking to postmaster`, { flags: s.storyFlags });
        await tapKey(page, 'E');
        await page.waitForTimeout(220);
        const after = await state(page);
        if (after.dialogueOpen) await walkDialogue(page, s.storyFlags);
        continue;
      }
      // Work down the board rather than hammering slot 1. A contract the board
      // will not give us is skipped and remembered, so one stubborn slot cannot
      // hold the whole region (and the rest of the map) hostage (#440).
      if (s.availableContractIds.length > 0) {
        let accepted = false;
        for (let slot = 1; slot <= Math.min(s.availableContractIds.length, 9); slot++) {
          const id = s.availableContractIds[slot - 1];
          if (unacceptable.has(id)) continue;
          const outcome = await acceptSlot(page, slot, id);
          if (outcome === 'accepted') {
            record(`at home ${s.regionId}, accepted ${id}`, { offered: s.availableContractIds });
            accepted = true;
            break;
          }
          unacceptable.add(id);
          record(`  board slot ${slot} (${id}) ${outcome}; skipping it`);
        }
        if (accepted) continue;
        // Nothing on this board can be taken. Fall through to the gateway
        // handling below so the region is finished and we move on, instead of
        // coming straight back here next step.
        record(`  no acceptable contract on the ${s.regionId} board`, {
          offered: s.availableContractIds,
          skipped: [...unacceptable],
        });
      }
      // Nothing left to do here: this region is done for now.
      doneRegions.add(s.regionId);
      // Travel to a connected region that is not already done, preferring new
      // ground. Falls back to any untried gateway (e.g. a spoke's single road
      // back to the hub) so we can return for the final blockade talk.
      const gw =
        s.gateways.find((g) => !doneRegions.has(g.to) && !triedGateways.has(`${s.regionId}->${g.to}`)) ??
        s.gateways.find((g) => !triedGateways.has(`${s.regionId}->${g.to}`));
      if (gw) {
        triedGateways.add(`${s.regionId}->${gw.to}`);
        record(`region ${s.regionId} exhausted, travelling via gateway to ${gw.to}`);
        await driveToTile(page, held, gw.tileX, gw.tileY);
        for (let t = 0; t < 40; t++) {
          const st = await state(page);
          if (!st) { await page.waitForTimeout(100); continue; }
          if (st.regionId === gw.to) break;
          if (st.courier.tileX !== gw.tileX || st.courier.tileY !== gw.tileY) await driveToTile(page, held, gw.tileX, gw.tileY);
          await tapKey(page, 'T');
          await page.waitForTimeout(150);
        }
        continue;
      }
      record('at home, board empty, postmaster talked, no untried gateway — halting');
      await shot(page, `dead-end-${step}`);
      break;
    }

    // Not home, no contract: go home.
    const r = await driveToTile(page, held, s.home.tileX, s.home.tileY);
    if (r === 'stuck') { record('stuck driving home'); await shot(page, `stuck-home-${step}`); break; }
  }

  const end = await state(page);
  record('END', { region: end?.regionId, deliveries: end?.deliveries, coins: end?.coins, rep: end?.reputation, level: end?.level, world: end?.worldState });
  await shot(page, 'zz-end');
  if (errors.length) record('RUNTIME ERRORS', errors);
  else record('no runtime errors');

  writeFileSync(`${OUT}/log.txt`, log.join('\n'));
  console.log(`wrote ${OUT}/log.txt and ${summariesSeen.size ? 'milestone ' : ''}screenshots to ${OUT}`);
} finally {
  if (browser) await browser.close();
  if (server.pid) { try { process.kill(-server.pid); } catch { /* already gone */ } }
}
