import { test, expect } from '@playwright/test';
import {
  bootE2E,
  collectErrors,
  driveToTile,
  pressUntil,
  readTick,
  releaseAll,
  seatAt,
  tapKey,
  waitForFrames,
  type Arrow,
} from './drive';

// The world, story and progression cues have real callers (#384).
//
// Same reasoning as audio.spec.ts: e2e runs with no AudioContext, so a call site
// that never fires looks exactly like one that does, and only the recorded cue
// distinguishes them (trap 1). What this spec adds is the moments a plain
// delivery loop passes through and no other spec asserts on.
//
// Coordinates and contract slots come from live state, never hardcoded.

const SALTREACH_STANDING = [
  'saltreach-tide-to-reed',
  'saltreach-tide-to-keep',
  'saltreach-tide-to-cormorant',
];

test('a delivery run sounds the moments along it', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);

  // Seed one delivery done, which reconnects Eastwatch and puts the lateral
  // second-wave route on the board. That route is the region's only ungated
  // two-leg contract, and a two-leg contract is the whole point here: a one-leg
  // one collects at the board, so there is no away pickup to sound.
  //
  // Eastwatch is seeded as already visited so the pickup is only a pickup. On a
  // genuine first arrival the collection cue loses its frame to the louder
  // first-arrival cue, which is the collision rule working: reaching a place you
  // have never seen is the bigger news, and the player hears one thing, not two.
  // That is correct behaviour and a poor test of the collection call site.
  await page.addInitScript(() => {
    localStorage.setItem(
      'courier-of-the-borderlands/save',
      JSON.stringify({
        version: 1,
        coins: 100,
        reputation: { eastwatch: 4 },
        unlocks: [],
        upgrades: [],
        completed: ['letters-to-eastwatch'],
        visited: ['eastwatch'],
        regionId: 'greybridge',
        fogByRegion: {},
        activeContractId: null,
        contractStatus: null,
        distanceTiles: 20,
        deliveries: 1,
        achievements: [],
        storyFlags: [],
      }),
    );
  });

  await bootE2E(page, { turbo: true, noWear: true });
  const held = new Set<Arrow>();

  const start = (await readTick(page, 0, 0)).state;
  await page.evaluate(() => globalThis.__courier?.clearAudioCue());

  // Arriving somewhere for the first time.
  await driveToTile(page, held, start.home.tileX, start.home.tileY);
  await releaseAll(page, held);
  await seatAt(page, start.home.tileX, start.home.tileY);
  await waitForFrames(page, 2);
  const arrived = (await readTick(page, 0, 0)).state;
  expect(
    arrived.audio.played,
    `cues on the way home: ${arrived.audio.played.join(', ')}`,
  ).toContain('settlement-found');

  // The board slot holding the two-leg route, found by id rather than assumed to
  // be slot 1: the board's contents shift as the arc opens work.
  const slot = arrived.availableContractIds.indexOf('greybridge-eastwatch-relay');
  expect(slot, `two-leg route missing from ${arrived.availableContractIds.join(', ')}`)
    .toBeGreaterThanOrEqual(0);
  const digit = String(slot + 1);

  // Arming a board slot. The confirming press was audible and the arming was
  // not, which made the two-press flow lopsided (#384).
  await page.evaluate(() => globalThis.__courier?.clearAudioCue());
  await tapKey(page, digit);
  await waitForFrames(page, 2);
  const armed = (await readTick(page, 0, 0)).state;
  expect(armed.armedContractId, 'the first press should arm a slot').toBe(
    'greybridge-eastwatch-relay',
  );
  expect(armed.audio.lastPlayed).toBe('board-armed');

  await tapKey(page, digit);
  await waitForFrames(page, 2);
  const accepted = (await readTick(page, 0, 0)).state;
  expect(accepted.activeContractId).toBe('greybridge-eastwatch-relay');
  expect(accepted.audio.lastPlayed).toBe('contract-accepted');

  // Collecting at a pickup away from home: the silent middle of the two-leg
  // contracts until #384. Accepting and delivering both already spoke.
  expect(accepted.pickup, 'the two-leg route should name a pickup').not.toBeNull();
  await page.evaluate(() => globalThis.__courier?.clearAudioCue());
  if (accepted.pickup !== null) {
    await driveToTile(page, held, accepted.pickup.tileX, accepted.pickup.tileY);
    await releaseAll(page, held);
    await waitForFrames(page, 4);
  }
  const collected = (await readTick(page, 0, 0)).state;
  expect(collected.contractStatus, 'the cargo should be aboard').toBe('carrying');
  expect(
    collected.audio.played,
    `cues at the pickup: ${collected.audio.played.join(', ')}`,
  ).toContain('cargo-collected');

  expect(errors, `runtime errors during the moments run:\n${errors.join('\n')}`).toEqual([]);
});

test('the delivery that clears a region sounds it', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);

  // Seed Saltreach one standing route short of cleared, with no reveal flag, so
  // the board offers exactly the contract that finishes the region.
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
        visited: [
          ...completed,
          'tidewatch',
          'reedford',
          'saltkeep',
          'cormorant-rock',
          'saltmere',
        ],
        regionId: 'saltreach',
        fogByRegion: {},
        activeContractId: null,
        contractStatus: null,
        distanceTiles: 0,
        deliveries: completed.length,
        achievements: [],
        skills: { 'off-road': 3 },
        storyFlags: [],
      }),
    );
  }, SALTREACH_STANDING);

  await bootE2E(page, { turbo: true, noWear: true });
  const held = new Set<Arrow>();

  const start = (await readTick(page, 0, 0)).state;
  expect(start.regionId).toBe('saltreach');
  expect(start.regionCleared, 'the region must start uncleared').toBe(false);
  expect(start.summaryVisible).toBe(false);

  await driveToTile(page, held, start.home.tileX, start.home.tileY);
  await releaseAll(page, held);
  await seatAt(page, start.home.tileX, start.home.tileY);
  await waitForFrames(page, 2);

  await tapKey(page, '1');
  await waitForFrames(page, 2);
  await tapKey(page, '1');
  await waitForFrames(page, 2);
  const accepted = (await readTick(page, 0, 0)).state;
  expect(accepted.activeContractId, 'the spec needs the last standing contract').not.toBeNull();

  await page.evaluate(() => globalThis.__courier?.clearAudioCue());
  for (const leg of [accepted.pickup, accepted.destination]) {
    if (leg === null) {
      continue;
    }
    await driveToTile(page, held, leg.tileX, leg.tileY);
    await releaseAll(page, held);
    await waitForFrames(page, 4);
  }

  const done = (await readTick(page, 0, 0)).state;
  expect(done.regionCleared, 'the delivery should have cleared the region').toBe(true);
  expect(done.summaryVisible).toBe(true);
  // The counterpart to region-cleared.spec.ts, which proves booting into an
  // already-cleared region stays silent. Together they pin the announce gate:
  // one delivery clears the region and sounds, every later load does not.
  expect(
    done.audio.played,
    `cues on the clearing delivery: ${done.audio.played.join(', ')}`,
  ).toContain('region-cleared');

  expect(errors, `runtime errors during the clearing run:\n${errors.join('\n')}`).toEqual([]);
});

// The Greybridge wayside discovery (src/data/discoveries.ts). Hardcoded, like
// every other coordinate-bearing spec in this suite, so a map edit that moves it
// shows up here; see the note in CLAUDE.md about running the full browser suite
// rather than just the arc after a map change.
const GREYBRIDGE_DISCOVERY = { x: 25, y: 1 };

test('finding a wayside discovery sounds the reveal payoff', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await bootE2E(page, { turbo: true, noWear: true });
  const held = new Set<Arrow>();

  await page.evaluate(() => globalThis.__courier?.clearAudioCue());
  // Driving near is enough: a discovery is found the moment its tile first
  // reveals, not on arrival, which is what makes it the payoff for investing in
  // sight rather than for walking (#111). The drive stops a tile short for that
  // reason, so this would fail if the cue were wired to arrival instead.
  await driveToTile(page, held, GREYBRIDGE_DISCOVERY.x, GREYBRIDGE_DISCOVERY.y + 1);
  await releaseAll(page, held);
  await waitForFrames(page, 4);

  const found = (await readTick(page, 0, 0)).state;
  expect(
    found.audio.played,
    `cues on the way to the discovery: ${found.audio.played.join(', ')}`,
  ).toContain('discovery');

  expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

// The Saltreach coast-road toll (src/data/encounters.ts), the only encounter in
// the game whose outcome takes coins rather than giving them.
const SALTREACH_TOLL_TILE = { x: 5, y: 3 };

test('paying an encounter toll sounds different from being paid', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      'courier-of-the-borderlands/save',
      JSON.stringify({
        version: 1,
        coins: 200,
        reputation: { tidewatch: 20 },
        unlocks: [],
        upgrades: [],
        completed: [],
        visited: ['tidewatch', 'reedford', 'saltkeep', 'cormorant-rock', 'saltmere'],
        regionId: 'saltreach',
        fogByRegion: {},
        activeContractId: null,
        contractStatus: null,
        distanceTiles: 0,
        deliveries: 0,
        achievements: [],
        storyFlags: [],
      }),
    );
  });
  await bootE2E(page, { turbo: true, noWear: true });
  const held = new Set<Arrow>();

  await driveToTile(page, held, SALTREACH_TOLL_TILE.x, SALTREACH_TOLL_TILE.y);
  await releaseAll(page, held);
  await expect
    .poll(async () => (await readTick(page, 0, 0)).state.activeEncounterId, { timeout: 15_000 })
    .toBe('saltreach-toll');

  const before = (await readTick(page, 0, 0)).state.coins;
  await pressUntil(page, '1', async () => (await readTick(page, 0, 0)).state.coins < before);
  const paid = (await readTick(page, 0, 0)).state;
  expect(paid.coins).toBe(before - 15);
  // The cue follows what actually left the purse, not the nominal outcome: the
  // same choice on a broke courier moves nothing and would sound like the other
  // branch. Paying and being paid are opposite moments and must not share a cue.
  expect(paid.audio.lastPlayed).toBe('encounter-paid');

  expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

/** Boot Greybridge with a seeded ledger, then run one contract end to end. */
async function oneDelivery(
  page: import('@playwright/test').Page,
  reputation: Record<string, number>,
) {
  await page.addInitScript((rep) => {
    localStorage.setItem(
      'courier-of-the-borderlands/save',
      JSON.stringify({
        version: 1,
        coins: 100,
        reputation: rep,
        unlocks: [],
        upgrades: [],
        completed: [],
        visited: ['greywater', 'eastwatch', 'southmill', 'ironhollow', 'northcairn', 'mirewatch'],
        regionId: 'greybridge',
        fogByRegion: {},
        activeContractId: null,
        contractStatus: null,
        distanceTiles: 0,
        deliveries: 0,
        achievements: [],
        storyFlags: [],
      }),
    );
  }, reputation);

  await bootE2E(page, { turbo: true, noWear: true });
  const held = new Set<Arrow>();
  const start = (await readTick(page, 0, 0)).state;

  await driveToTile(page, held, start.home.tileX, start.home.tileY);
  await releaseAll(page, held);
  await seatAt(page, start.home.tileX, start.home.tileY);
  await waitForFrames(page, 2);
  await tapKey(page, '1');
  await waitForFrames(page, 2);
  await tapKey(page, '1');
  await waitForFrames(page, 2);

  const accepted = (await readTick(page, 0, 0)).state;
  expect(accepted.activeContractId, 'the run needs a contract in hand').not.toBeNull();
  await page.evaluate(() => globalThis.__courier?.clearAudioCue());
  for (const leg of [accepted.pickup, accepted.destination]) {
    if (leg !== null) {
      await driveToTile(page, held, leg.tileX, leg.tileY);
      await releaseAll(page, held);
      await waitForFrames(page, 4);
    }
  }
  const done = (await readTick(page, 0, 0)).state;
  expect(done.deliveries, 'the delivery should have landed').toBeGreaterThan(0);
  return done;
}

test('a delivery that raises standing says so', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  // One reputation short of Trusted, so the delivery crosses the tier. Every
  // other settlement is pre-visited, so no first-arrival cue competes; the
  // achievement earned on the same frame is quieter and loses, which is correct
  // (standing changes what work pays, an achievement is a certificate).
  const done = await oneDelivery(page, { greywater: 7 });
  expect(done.reputation).toBeGreaterThanOrEqual(8);
  expect(
    done.audio.played,
    `cues on the delivery: ${done.audio.played.join(', ')}`,
  ).toContain('standing-risen');
  expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('an achievement unlocked inside a grouped toast still sounds', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  // Seeded at the top standing tier, so nothing louder fires on the same frame
  // and the achievement is what the player hears. It arrives inside a grouped
  // toast panel with no sound of its own before #384.
  const done = await oneDelivery(page, { greywater: 20 });
  expect(
    done.audio.played,
    `cues on the delivery: ${done.audio.played.join(', ')}`,
  ).toContain('achievement');
  expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('a delivery that meets its bonus objective sounds brighter', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);

  // The Ironhollow rumours run carries a swift bonus (17 tiles; the shortest
  // route is 14), so driving it directly meets it. Everything that could fire on
  // the same frame is seeded away: top standing tier, every settlement visited,
  // every achievement already held. What is left is the delivery itself, and the
  // point of this test is that it is the brighter one.
  //
  // The bonus's slack is only 3 tiles, and a road encounter opening its modal
  // mid-drive spends more than that on its own, which turns "missed the bonus"
  // (correct, once an encounter fires) into a false read on this cue-only spec
  // (#393). Both Greybridge encounters (greybridge-stranded, greybridge-rockfall
  // in src/data/encounters.ts) are seeded resolved via their no-reward outcome
  // flag, so the drive has one uncontrolled variable fewer, matching how this
  // spec already seeds away every other collider.
  await page.addInitScript(() => {
    localStorage.setItem(
      'courier-of-the-borderlands/save',
      JSON.stringify({
        version: 1,
        coins: 100,
        reputation: { greywater: 20 },
        unlocks: [],
        upgrades: [],
        completed: [],
        visited: ['greywater', 'eastwatch', 'southmill', 'ironhollow', 'northcairn', 'mirewatch'],
        regionId: 'greybridge',
        fogByRegion: {},
        activeContractId: null,
        contractStatus: null,
        distanceTiles: 0,
        deliveries: 0,
        achievements: [
          'first-delivery',
          'ford-finder',
          'cartographer',
          'well-equipped',
          'long-hauler',
          'borderland-courier',
        ],
        storyFlags: ['enc_stranded_passed', 'enc_rockfall_picked'],
      }),
    );
  });

  // No turbo on this one: the bonus's 3-tile slack leaves little room for the
  // cornering overshoot that a doubled per-frame step adds under load (#393).
  // The route is short, so running it at real wheel speed costs a few seconds,
  // not the drive's correctness.
  await bootE2E(page, { noWear: true });
  const held = new Set<Arrow>();
  const start = (await readTick(page, 0, 0)).state;

  await driveToTile(page, held, start.home.tileX, start.home.tileY);
  await releaseAll(page, held);
  await seatAt(page, start.home.tileX, start.home.tileY);
  await waitForFrames(page, 2);

  const atBoard = (await readTick(page, 0, 0)).state;
  const slot = atBoard.availableContractIds.indexOf('rumours-to-ironhollow');
  expect(slot, `bonus run missing from ${atBoard.availableContractIds.join(', ')}`)
    .toBeGreaterThanOrEqual(0);
  const digit = String(slot + 1);
  await tapKey(page, digit);
  await waitForFrames(page, 2);
  await tapKey(page, digit);
  await waitForFrames(page, 2);
  const accepted = (await readTick(page, 0, 0)).state;
  expect(accepted.activeContractId).toBe('rumours-to-ironhollow');

  await page.evaluate(() => globalThis.__courier?.clearAudioCue());
  const target = accepted.destination ?? accepted.pickup;
  expect(target).not.toBeNull();
  if (target !== null) {
    await driveToTile(page, held, target.tileX, target.tileY);
    await releaseAll(page, held);
    await waitForFrames(page, 4);
  }

  const done = (await readTick(page, 0, 0)).state;
  expect(done.deliveries).toBeGreaterThan(0);
  // A brighter delivery, not a second voice layered over the plain one: the
  // collision rule allows one cue per frame, so the flourish has to be the cue.
  expect(
    done.audio.played,
    `cues on the bonus delivery: ${done.audio.played.join(', ')}`,
  ).toContain('delivered-bonus');
  expect(done.audio.played).not.toContain('delivered');

  expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
