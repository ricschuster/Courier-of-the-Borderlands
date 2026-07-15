// Autonomous playthrough driver. Boots the real built game with ?e2e, then
// greedily plays the delivery loop across regions using genuine key presses,
// reading state and pathfinding via window.__courier. Logs every action and
// screenshots milestones. Modeled on scripts/shot.mjs for server bootstrap.
//
//   node autoplay.mjs [--no-build]

import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = 4175;
const ROOT = '/home/richard/Work/Courier-of-the-Borderlands/';
const BASE = `http://localhost:${PORT}/Courier-of-the-Borderlands/`;
const OUT = '/tmp/claude-1000/-home-richard-Work-Courier-of-the-Borderlands/b219ea16-22a3-4c05-a1a2-e1d56243f433/scratchpad/play';
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
    if (s.dialogueChoices.length === 0) { await page.keyboard.press('Escape'); await page.waitForTimeout(120); continue; }
    const sig = s.dialogueChoices.join('|');
    // If we loop back to a node we've already resolved, exit rather than spin.
    if (seen.has(sig) && !s.dialogueChoices.some((c) => PROGRESS.some((p) => c.toLowerCase().includes(p)))) {
      await page.keyboard.press('Escape'); await page.waitForTimeout(120); continue;
    }
    seen.add(sig);
    await page.keyboard.press(String(pickChoice(s.dialogueChoices) + 1));
    await page.waitForTimeout(160);
  }
  let s = await state(page);
  if (s && s.dialogueOpen) { await page.keyboard.press('Escape'); await page.waitForTimeout(120); s = await state(page); }
  const gained = s ? s.storyFlags.filter((f) => !before.includes(f)) : [];
  if (gained.length) record('  dialogue set flags', gained);
  return gained;
}

// Ensure the skills panel is closed so number keys reach the contract board.
async function closeSkillPanel(page) {
  for (let i = 0; i < 3; i++) {
    const s = await state(page);
    if (!s || !s.skillPanelOpen) return;
    await page.keyboard.press('k');
    await page.waitForTimeout(120);
  }
}

// Spend coins and skill points the way a completionist plays: buy the cheapest
// affordable upgrade and rank skills (Off-road first, which opens the mire), so
// the buy/rank flows are exercised and gated content is reachable. Number keys
// select skills in panel order: 1 Wayfinder, 2 Off-road, 3 Negotiator, 4 Cipher.
// Returns true if anything was bought or ranked so the caller re-reads. Bounded:
// finite coins/points, and maxed skills / an unaffordable shop ignore presses.
async function spendAtHome(page) {
  await closeSkillPanel(page);
  const before = await state(page);
  if (!before) return false;

  await page.keyboard.press('B'); // buy cheapest affordable upgrade (no-op if none)
  await page.waitForTimeout(150);

  if (before.skillPoints > 0) {
    await page.keyboard.press('k');
    await page.waitForTimeout(120);
    const opened = await state(page);
    if (opened && opened.skillPanelOpen) {
      for (const key of ['2', '1', '3', '4']) {
        await page.keyboard.press(key);
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

  // Fresh game every run.
  await page.goto(`${BASE}play.html?e2e`, { waitUntil: 'networkidle' });
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

  for (let step = 0; step < 220; step++) {
    const s = await state(page);
    if (!s) { record('state hook lost'); break; }

    if (s.regionId !== lastRegion) {
      record(`ENTER region ${s.regionId}`, { coins: s.coins, rep: s.reputation, level: s.level });
      await shot(page, `region-${s.regionId}`);
      lastRegion = s.regionId;
      triedGateways.clear();
    }

    if (s.capstoneVisible) {
      record('CAPSTONE reached — arc complete', { deliveries: s.deliveries, coins: s.coins, rep: s.reputation, level: s.level });
      await shot(page, 'zz-capstone');
      break;
    }
    if (s.dialogueOpen) { await walkDialogue(page, s.storyFlags); continue; }
    if (s.summaryVisible) {
      if (!summariesSeen.has(s.regionId)) { summariesSeen.add(s.regionId); record('region-cleared summary shown', { region: s.regionId }); await shot(page, `summary-${s.regionId}`); }
      await page.keyboard.press('Escape'); // the summary panel dismisses on Esc, not Space
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
        await page.keyboard.press('Space'); // dismiss delivery toast
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
        await page.keyboard.press('E');
        await page.waitForTimeout(220);
        const after = await state(page);
        if (after.dialogueOpen) await walkDialogue(page, s.storyFlags);
        continue;
      }
      if (s.availableContractIds.length > 0) {
        record(`at home ${s.regionId}, accepting ${s.availableContractIds[0]}`, { offered: s.availableContractIds });
        await page.keyboard.press('1');
        await page.waitForTimeout(200);
        continue;
      }
      // Unlock the ford if this region has a signpost we haven't reached.
      if (s.signpost && !s.fordUnlocked) {
        record(`driving to signpost to unlock ford in ${s.regionId}`);
        await driveToTile(page, held, s.signpost.tileX, s.signpost.tileY);
        continue;
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
          await page.keyboard.press('T');
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
} finally {
  if (browser) await browser.close();
  if (server.pid) { try { process.kill(-server.pid); } catch { /* already gone */ } }
}
