import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, driveToTile, pressUntil, readTick, type Arrow } from './drive';

// The board renumbers between visits, so a remembered digit used to accept a
// different contract on the first press and commit the whole next journey. The
// board now arms on the first press and accepts only on a confirming second
// press of the same slot (#321). All input is genuine keyboard input.

test('accepting a board contract needs a confirming second press', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);

  await bootE2E(page);
  const held = new Set<Arrow>();

  const start = await readTick(page, 0, 0);
  expect(start.state.activeContractId).toBeNull();

  // Drive to the home town so the board is up.
  const home = start.state.home;
  await driveToTile(page, held, home.tileX, home.tileY);
  const atHome = await readTick(page, home.tileX, home.tileY);
  expect(atHome.state.atHome).toBe(true);
  expect(atHome.state.availableContractIds).toContain('letters-to-eastwatch');

  // First press of "1" arms the first slot but does NOT accept it: this is the
  // mispress guard. Re-press until armed (a single press can drop under load).
  await pressUntil(
    page,
    '1',
    async () =>
      (await readTick(page, home.tileX, home.tileY)).state.armedContractId ===
      'letters-to-eastwatch',
  );
  const armed = await readTick(page, home.tileX, home.tileY);
  expect(armed.state.armedContractId).toBe('letters-to-eastwatch');
  expect(armed.state.activeContractId).toBeNull();

  // Second press of the same slot confirms and accepts it.
  await pressUntil(
    page,
    '1',
    async () =>
      (await readTick(page, home.tileX, home.tileY)).state.activeContractId ===
      'letters-to-eastwatch',
  );
  const accepted = await readTick(page, home.tileX, home.tileY);
  expect(accepted.state.contractStatus).toBe('carrying');
  expect(accepted.state.armedContractId).toBeNull();

  expect(errors, `runtime errors during board confirm:\n${errors.join('\n')}`).toEqual([]);
});
