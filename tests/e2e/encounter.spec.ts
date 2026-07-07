import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, driveToTile, pressUntil, readTick, type Arrow } from './drive';

// Input-driven road-encounter test: boot the real built game and drive east out
// of Greywater onto the encounter tile (7,8), where a stranded courier is
// waiting. The encounter opens on arrival with no key press (unlike settlement
// NPC talk), a real number press takes the "help" choice, and we assert the
// coin and reputation outcome lands in live state and the resolution flag
// persists to the save. Shared helpers live in ./drive.

const ENCOUNTER_TILE = { x: 7, y: 8 };

test('a road encounter fires on its tile and a choice applies its outcome', async ({ page }) => {
  test.setTimeout(90_000);

  const errors = collectErrors(page);
  await bootE2E(page);

  const held = new Set<Arrow>();

  // Baseline: fresh game, no story flags, no conversation, no encounter open.
  const start = await readTick(page, 0, 0);
  expect(start.state.regionId).toBe('greybridge');
  expect(start.state.storyFlags).toEqual([]);
  expect(start.state.activeEncounterId).toBeNull();

  // 1. Drive east along the main road onto the encounter tile. The encounter
  //    opens by itself on arrival: no talk key needed. driveToTile returns once
  //    the courier is on the tile, by which point movement has frozen modally.
  await driveToTile(page, held, ENCOUNTER_TILE.x, ENCOUNTER_TILE.y);
  // The encounter opens from the update loop a frame or two after arrival, with
  // no key press, so poll live state until it registers.
  await expect
    .poll(
      async () =>
        (await readTick(page, ENCOUNTER_TILE.x, ENCOUNTER_TILE.y)).state.activeEncounterId,
      { timeout: 15_000 },
    )
    .toBe('greybridge-stranded');

  const opened = await readTick(page, ENCOUNTER_TILE.x, ENCOUNTER_TILE.y);
  expect(opened.state.activeEncounterId).toBe('greybridge-stranded');
  expect(opened.state.dialogueOpen).toBe(true);
  const coinsBefore = opened.state.coins;
  const reputationBefore = opened.state.reputation;

  // 2. Take the first choice ("Lend a hand"), which sets the helped flag and
  //    applies +6 coins, +2 reputation. Re-press until the flag lands.
  await pressUntil(
    page,
    '1',
    async () =>
      (await readTick(page, ENCOUNTER_TILE.x, ENCOUNTER_TILE.y)).state.storyFlags.includes(
        'enc_stranded_helped',
      ),
  );
  const after = await readTick(page, ENCOUNTER_TILE.x, ENCOUNTER_TILE.y);
  expect(after.state.storyFlags).toContain('enc_stranded_helped');
  expect(after.state.coins).toBe(coinsBefore + 6);
  expect(after.state.reputation).toBe(reputationBefore + 2);

  // 3. Close the conversation; the encounter clears.
  await pressUntil(
    page,
    'Escape',
    async () => !(await readTick(page, ENCOUNTER_TILE.x, ENCOUNTER_TILE.y)).state.dialogueOpen,
  );
  const closed = await readTick(page, ENCOUNTER_TILE.x, ENCOUNTER_TILE.y);
  expect(closed.state.dialogueOpen).toBe(false);
  expect(closed.state.activeEncounterId).toBeNull();

  // 4. The resolution flag must persist to the save (one-shot across reloads).
  const save = await page.evaluate(() => localStorage.getItem('courier-of-the-borderlands/save'));
  const parsed = JSON.parse(save ?? '{}');
  expect(parsed.storyFlags).toContain('enc_stranded_helped');

  // No runtime errors during the encounter.
  expect(errors, `runtime errors during encounter:\n${errors.join('\n')}`).toEqual([]);
});
