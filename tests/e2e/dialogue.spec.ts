import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, driveToTile, pressUntil, readTick, type Arrow } from './drive';

// Input-driven dialogue test: boot the real built game, drive to the home town,
// open the Greywater postmaster conversation with the talk key, take a choice
// with a real number press, and assert the story flag it sets lands in live
// state and persists to the save. All input is genuine keyboard input flowing
// through Phaser, the same path a player takes. Shared helpers live in ./drive.

test('opens the postmaster dialogue and a choice sets a persisted story flag', async ({ page }) => {
  test.setTimeout(90_000);

  const errors = collectErrors(page);
  await bootE2E(page);

  const held = new Set<Arrow>();

  // Baseline: fresh game, no story flags, no conversation open.
  const start = await readTick(page, 0, 0);
  expect(start.state.regionId).toBe('greybridge');
  expect(start.state.storyFlags).toEqual([]);
  expect(start.state.dialogueOpen).toBe(false);

  // 1. Drive to the home town, where the postmaster speaks.
  const home = start.state.home;
  await driveToTile(page, held, home.tileX, home.tileY);
  const atHome = await readTick(page, home.tileX, home.tileY);
  expect(atHome.state.atHome).toBe(true);

  // 2. Open the conversation with the talk key, re-pressing until it registers
  //    (a single press can drop under CI load).
  await pressUntil(
    page,
    'e',
    async () => (await readTick(page, home.tileX, home.tileY)).state.dialogueOpen,
  );
  expect((await readTick(page, home.tileX, home.tileY)).state.dialogueOpen).toBe(true);
  // The home contract board yields to the open dialogue so the two do not
  // overlap (#181): while talking, the board is hidden.
  expect((await readTick(page, home.tileX, home.tileY)).state.boardVisible).toBe(false);

  // 3. Take the first choice ("What is happening to the roads?"), which sets the
  //    met-postmaster flag. Re-press until the flag lands.
  await pressUntil(
    page,
    '1',
    async () =>
      (await readTick(page, home.tileX, home.tileY)).state.storyFlags.includes('met_postmaster'),
  );
  const after = await readTick(page, home.tileX, home.tileY);
  expect(after.state.storyFlags).toContain('met_postmaster');
  // The Act 1 reveal flag is NOT set yet: the region is not reconnected.
  expect(after.state.storyFlags).not.toContain('greybridge_reveal');
  // The conversation is still open on the next node.
  expect(after.state.dialogueOpen).toBe(true);

  // 4. Step away with Escape; the conversation closes.
  await pressUntil(
    page,
    'Escape',
    async () => !(await readTick(page, home.tileX, home.tileY)).state.dialogueOpen,
  );
  const closed = await readTick(page, home.tileX, home.tileY);
  expect(closed.state.dialogueOpen).toBe(false);
  // With the dialogue closed and still at home with no active contract, the
  // board returns: it was suppressed by the dialogue, not by anything else.
  expect(closed.state.boardVisible).toBe(true);

  // 5. The story flag must persist to the save.
  const save = await page.evaluate(() => localStorage.getItem('courier-of-the-borderlands/save'));
  const parsed = JSON.parse(save ?? '{}');
  expect(parsed.storyFlags).toContain('met_postmaster');

  // No runtime errors during the conversation.
  expect(errors, `runtime errors during dialogue:\n${errors.join('\n')}`).toEqual([]);
});
