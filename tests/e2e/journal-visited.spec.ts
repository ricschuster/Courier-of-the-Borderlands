import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, driveToTile, readTick, tapKey, type Arrow } from './drive';

// #414. The journal's visited-settlement list had no test anywhere: the pure
// builder in journal-text.ts is covered and TripTracker.visit() is covered, but
// nothing checked that the scene passes the one to the other. A stale reader left
// the journal reading an empty set during #413 and 1240 unit tests plus 52
// browser tests all passed.
//
// The wire is the thing under test here, so it has to be driven for real: visit a
// place, open the journal, read the canvas text back.

const GREYWATER = {
  x: 2,
  y: 8,
  name: 'Greywater',
  note: 'A tired river town where every courier road begins.',
};
const NORTHCAIRN = {
  x: 5,
  y: 3,
  name: 'Northcairn',
  note: 'A ring of standing stones on the high moor',
};

/** Undiscovered places render as '???', so this counts places not yet found. */
function countMasks(journal: string | null): number {
  return (journal ?? '').split('???').length - 1;
}

test('the journal lists settlements the courier has actually visited', async ({ page }) => {
  test.setTimeout(90_000);

  const errors = collectErrors(page);
  await bootE2E(page);

  const held = new Set<Arrow>();

  // The run starts beside Greywater, so drive onto it to register the arrival
  // rather than assuming the spawn counts as a visit.
  await driveToTile(page, held, GREYWATER.x, GREYWATER.y);

  await tapKey(page, 'J');
  const opened = (await readTick(page, 0, 0)).state.journalText;
  expect(opened, 'the journal should be open').not.toBeNull();

  // The place the courier is standing on is named and described.
  expect(opened).toContain(GREYWATER.name);
  expect(opened).toContain(GREYWATER.note);

  // Places it has not reached are masked entirely, so nothing leaks ahead of
  // discovery. Counting the masks is the assertion that survives the settlement
  // list changing; a bare name check does not, because contract titles mention
  // places the courier has never been.
  const masksBefore = countMasks(opened);
  expect(masksBefore, 'undiscovered places should be masked').toBeGreaterThan(0);
  expect(opened).toContain('Places found: 1 /');

  await tapKey(page, 'J');
  expect((await readTick(page, 0, 0)).state.journalText, 'closing clears it').toBeNull();

  // Drive to a second settlement and confirm it joins the list, so the test is
  // measuring the live visited set and not a fixed opening entry.
  await driveToTile(page, held, NORTHCAIRN.x, NORTHCAIRN.y);
  await tapKey(page, 'J');

  const after = (await readTick(page, 0, 0)).state.journalText;
  expect(after).toContain(GREYWATER.name);
  expect(after).toContain(NORTHCAIRN.note);
  expect(after).toContain('Places found: 2 /');
  expect(countMasks(after), 'one fewer place should be masked').toBe(masksBefore - 1);

  expect(errors, `runtime errors reading the journal:\n${errors.join('\n')}`).toEqual([]);
});
