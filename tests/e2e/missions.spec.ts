import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, driveToTile, pressUntil, readTick, type Arrow } from './drive';

// Input-driven mission test: the Greybridge spine mission should advance as the
// player actually plays. Talking to the postmaster completes the first step;
// delivering the first contract completes the second. Mission progress is
// derived from real play state, so this drives the game with genuine input and
// reads the active mission step through the e2e hook.

test('the Greybridge spine mission advances through talking and delivering', async ({ page }) => {
  test.setTimeout(90_000);

  const errors = collectErrors(page);
  await bootE2E(page);
  const held = new Set<Arrow>();

  // Fresh game: the first mission asks the courier to meet the postmaster.
  const start = await readTick(page, 0, 0);
  expect(start.state.activeMissionId).toBe('greybridge-silence');
  expect(start.state.activeMissionStepId).toBe('meet');

  // Drive home and talk to the postmaster; the first choice sets met_postmaster,
  // which completes the "meet" step and advances the mission to the first letter.
  const home = start.state.home;
  await driveToTile(page, held, home.tileX, home.tileY);
  await pressUntil(
    page,
    'e',
    async () => (await readTick(page, home.tileX, home.tileY)).state.dialogueOpen,
  );
  await pressUntil(
    page,
    '1',
    async () =>
      (await readTick(page, home.tileX, home.tileY)).state.activeMissionStepId === 'first-letter',
  );
  await pressUntil(
    page,
    'Escape',
    async () => !(await readTick(page, home.tileX, home.tileY)).state.dialogueOpen,
  );

  // Accept the first contract and deliver it to Eastwatch.
  await pressUntil(
    page,
    '1',
    async () =>
      (await readTick(page, home.tileX, home.tileY)).state.activeContractId ===
      'letters-to-eastwatch',
  );
  const accepted = await readTick(page, home.tileX, home.tileY);
  const dest = accepted.state.destination!;
  await driveToTile(page, held, dest.tileX, dest.tileY);
  await expect
    .poll(async () => (await readTick(page, dest.tileX, dest.tileY)).state.deliveries, {
      timeout: 5_000,
    })
    .toBe(1);

  // With the first letter delivered, the mission advances to reconnecting the
  // rest of the region.
  const done = await readTick(page, dest.tileX, dest.tileY);
  expect(done.state.activeMissionStepId).toBe('reconnect');

  expect(errors, `runtime errors during mission run:\n${errors.join('\n')}`).toEqual([]);
});
