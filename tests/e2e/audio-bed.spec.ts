import { test, expect } from '@playwright/test';
import {
  bootE2E,
  collectErrors,
  driveToTile,
  readTick,
  releaseAll,
  tapKey,
  waitForFrames,
  type Arrow,
} from './drive';

// The rolling bed and the driving cues are real, and V silences them too (#383).
//
// This spec exists because the bed is the first continuous voice in the game and
// the "last requested cue" hook cannot describe one. A cue that never fires and a
// cue that fires are the same silence in CI; a bed stuck at zero gain and a bed
// following the wagon are the same silence too, and the bed has no discrete event
// to record. That is trap 1, so the scene publishes the profile it commanded and
// this asserts on it.
//
// Four things are pinned, and each fails differently:
//
//   - The bed is silent at rest, rises while driving, and settles back. A bed
//     that was never wired would stay at zero through the drive.
//   - It reports the ground under the wagon, so the terrain really does reach the
//     sound rather than a constant being published.
//   - Muting silences the voice, not just the cue requests. A mute that only
//     stopped cues would leave the wheels rolling.
//   - A frame with several requests plays exactly one of them, and it is the
//     loudest tier present.
//
// Coordinates come from live state, never hardcoded, so this stays out of the
// region-coordinate drift trap.

/** The four neighbours of a tile, as arrow key and offset. */
const NEIGHBOURS: readonly { key: Arrow; dx: number; dy: number }[] = [
  { key: 'ArrowRight', dx: 1, dy: 0 },
  { key: 'ArrowLeft', dx: -1, dy: 0 },
  { key: 'ArrowDown', dx: 0, dy: 1 },
  { key: 'ArrowUp', dx: 0, dy: -1 },
];

/**
 * A reachable tile far enough away that the drive crosses real ground. Chosen
 * from the live map through the game's own pathfinder, so it holds in any region
 * and survives a map edit.
 */
async function longDrive(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const api = globalThis.__courier;
    if (api === undefined) {
      return null;
    }
    const here = api.getState().courier;
    let best: { x: number; y: number; steps: number } | null = null;
    for (let dx = -18; dx <= 18; dx += 3) {
      for (let dy = -18; dy <= 18; dy += 3) {
        const x = here.tileX + dx;
        const y = here.tileY + dy;
        const path = api.pathTo(x, y);
        if (path !== null && (best === null || path.length > best.steps)) {
          best = { x, y, steps: path.length };
        }
      }
    }
    return best !== null && best.steps >= 12 ? best : null;
  });
}

test('the rolling bed follows the wagon, and V silences it', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await bootE2E(page, { turbo: true, noWear: true });
  const held = new Set<Arrow>();

  const start = (await readTick(page, 0, 0)).state;
  expect(start.audio.muted, 'sound defaults on').toBe(false);
  expect(start.audio.bed.gain, 'a parked wagon makes no rolling sound').toBe(0);

  // A long drive, sampling the bed every step. A single destination read would
  // not do: the bed only exists while the wheels are turning, and home is a few
  // tiles from spawn, which is not enough ground to cross two kinds of it.
  const far = await longDrive(page);
  expect(far, 'no long reachable drive from spawn').not.toBeNull();
  if (far === null) {
    return;
  }
  const gains: number[] = [];
  const surfaces = new Set<string>();
  const cues = new Set<string>();
  await driveToTile(page, held, far.x, far.y, undefined, (state) => {
    gains.push(state.audio.bed.gain);
    surfaces.add(state.audio.bed.surface);
    if (state.audio.lastCue !== null) {
      cues.add(state.audio.lastCue);
    }
  });
  await releaseAll(page, held);

  expect(gains.length, 'the drive should have taken several steps').toBeGreaterThan(3);
  const peak = Math.max(...gains);
  expect(peak, 'the bed never made a sound during the drive').toBeGreaterThan(0);
  // The ceiling is a promise the unit tests pin; this proves the live path
  // honours it rather than publishing some unclamped number.
  expect(peak).toBeLessThanOrEqual(0.08);

  // The ground has to reach the sound. A constant published every frame would
  // pass every assertion above and fail this one.
  expect(surfaces.size, `only ever rolled on: ${[...surfaces].join(', ')}`).toBeGreaterThan(1);
  expect(surfaces.has('unknown'), 'drove over ground with no bed surface').toBe(false);

  // Stopping settles. The wagon is parked, so the commanded gain is back to zero.
  await waitForFrames(page, 4);
  const parked = (await readTick(page, 0, 0)).state;
  expect(parked.audio.bed.gain, 'the bed kept rolling after the wagon stopped').toBe(0);

  // A panel freezes the wagon, and the wheels have to stop with it. Driven with
  // the key still held, because that is the case that goes wrong: the world path
  // that zeroes the bed never runs behind a modal, so the bed only settles if the
  // early-return asks it to.
  await page.keyboard.down('ArrowRight');
  await waitForFrames(page, 6);
  // tapKey, not press: a zero-gap keypress can fall between starved frames, and
  // the assertion below would then be reading a world frame rather than a modal
  // one. Polled open for the same reason.
  await tapKey(page, 'J');
  await expect
    .poll(async () => (await readTick(page, 0, 0)).state.overlayScrollOffset !== null, {
      timeout: 5_000,
    })
    .toBe(true);
  await waitForFrames(page, 3);
  const behindPanel = (await readTick(page, 0, 0)).state;
  await page.keyboard.up('ArrowRight');
  expect(behindPanel.audio.bed.gain, 'the wheels rolled on behind a panel').toBe(0);
  await tapKey(page, 'J');
  await waitForFrames(page, 2);

  // Drive back. The outward leg leaves a road and the return leg joins one, so
  // the two together cover both halves of the crossing pair; one leg alone only
  // ever proves whichever direction that route happens to take.
  await driveToTile(page, held, start.courier.tileX, start.courier.tileY, undefined, (state) => {
    if (state.audio.lastCue !== null) {
      cues.add(state.audio.lastCue);
    }
  });
  await releaseAll(page, held);

  // Crossing onto or off a road is the pillar's own moment, and the only driving
  // cue that fires on every route. Both call sites are invisible otherwise: every
  // bed assertion above would pass with the crossing cues deleted.
  const seen = `cues seen while driving: ${[...cues].join(', ')}`;
  expect(cues.has('road-joined'), seen).toBe(true);
  expect(cues.has('road-left'), seen).toBe(true);

  // Mute has to reach the voice, not just the cue queue. Held rather than driven
  // anywhere: what matters is that the wheels turn, not where they go.
  // tapKey and poll: a zero-gap V can fall between starved frames, and a mute
  // that never happened would leave the bed rolling and read as a bed bug.
  await tapKey(page, 'V');
  await expect
    .poll(async () => (await readTick(page, 0, 0)).state.audio.muted, { timeout: 5_000 })
    .toBe(true);
  const mutedGains: number[] = [];
  await page.keyboard.down('ArrowLeft');
  for (let i = 0; i < 6; i += 1) {
    await waitForFrames(page, 3);
    mutedGains.push((await readTick(page, 0, 0)).state.audio.bed.gain);
  }
  await page.keyboard.up('ArrowLeft');
  expect(Math.max(...mutedGains), 'the wheels kept rolling while muted').toBe(0);

  await tapKey(page, 'V');
  await expect
    .poll(async () => (await readTick(page, 0, 0)).state.audio.muted, { timeout: 5_000 })
    .toBe(false);

  expect(errors, `runtime errors during the bed run:\n${errors.join('\n')}`).toEqual([]);
});

test('driving into an impassable edge knocks instead of going silent', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await bootE2E(page, { turbo: true, noWear: true });
  const held = new Set<Arrow>();

  // Find a tile the wagon can stand on that has an impassable neighbour, near
  // enough to reach. Derived from the live map, so no coordinates are baked in.
  const spot = await page.evaluate((offsets) => {
    const api = globalThis.__courier;
    if (api === undefined) {
      return null;
    }
    const here = api.getState().courier;
    for (let radius = 1; radius <= 14; radius += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
            continue;
          }
          const x = here.tileX + dx;
          const y = here.tileY + dy;
          if (!api.isPassableTile(x, y) || api.pathTo(x, y) === null) {
            continue;
          }
          for (const n of offsets) {
            if (!api.isPassableTile(x + n.dx, y + n.dy)) {
              return { x, y, key: n.key };
            }
          }
        }
      }
    }
    return null;
  }, NEIGHBOURS);

  expect(spot, 'no reachable tile beside an impassable edge').not.toBeNull();
  if (spot === null) {
    return;
  }

  await driveToTile(page, held, spot.x, spot.y);
  await releaseAll(page, held);
  await waitForFrames(page, 2);
  await page.evaluate(() => globalThis.__courier?.clearAudioCue());

  // Push into the wall. Held, not tapped: the first frame of any press looks
  // blocked (velocity is set before physics runs), and the cue must not fire on
  // that, so it takes a sustained press to prove the real path.
  await page.keyboard.down(spot.key);
  await waitForFrames(page, 20);
  await page.keyboard.up(spot.key);
  await waitForFrames(page, 2);

  const bumped = (await readTick(page, 0, 0)).state;
  expect(bumped.audio.lastCue, 'driving into the edge stayed silent').toBe('bump');
  expect(bumped.audio.lastPlayed, 'the bump was requested but never played').toBe('bump');

  expect(errors, `runtime errors during the bump run:\n${errors.join('\n')}`).toEqual([]);
});
