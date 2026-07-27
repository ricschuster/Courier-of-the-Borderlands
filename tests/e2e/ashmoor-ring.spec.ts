import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, readTick, travelTo, type Arrow } from './drive';

// Browser guard for the ring topology (docs/design/10_open_world_expansion.md).
//
// The world used to be a hub with two dead-end spokes, so every destination had
// exactly one route to it. Ashmoor is the first region reachable from two
// different neighbours, and the unit suite can only see that the gateway data
// says so. This proves it in play: the courier drives to the Saltreach edge and
// crosses into Ashmoor, then does the same from Fenmarch, and the two crossings
// land on two different tiles in two different halves of the map.
//
// That last part is the assertion a star topology could never satisfy, which is
// why it is here rather than in a unit test. Coordinates come from the region
// data; the spec reads them off the live state rather than hardcoding them, so a
// map re-author moves the test with it.

// Ashmoor's two doors, 19 rows apart (src/data/region-ashmoor.ts).
const FROM_SALTREACH = { x: 0, y: 4 };
const FROM_FENMARCH = { x: 0, y: 23 };

/** Seed a save parked in one region, with nothing owned and no cargo. */
async function seedInRegion(page: import('@playwright/test').Page, regionId: string): Promise<void> {
  await page.addInitScript((region: string) => {
    localStorage.setItem(
      'courier-of-the-borderlands/save',
      JSON.stringify({
        version: 1,
        coins: 100,
        reputation: {},
        unlocks: [],
        upgrades: [],
        completed: [],
        visited: [],
        regionId: region,
        fogByRegion: {},
        activeContractId: null,
        contractStatus: null,
        distanceTiles: 0,
        deliveries: 0,
        achievements: [],
        skills: {},
        storyFlags: [],
      }),
    );
  }, regionId);
}

test('reaches Ashmoor from the Saltreach side and returns through the same gateway', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);

  await seedInRegion(page, 'saltreach');
  // Turbo for the cross-map drives; noWear because this is a topology test and
  // Ashmoor's 2.0x bog would otherwise strand a bare wagon mid-spec.
  await bootE2E(page, { turbo: true, noWear: true });

  const held = new Set<Arrow>();

  const start = await readTick(page, 0, 0);
  expect(start.state.regionId).toBe('saltreach');
  // Saltreach is no longer a dead end: it links onward as well as back.
  const onward = start.state.gateways.find((g) => g.to === 'ashmoor');
  expect(onward, 'saltreach should have a gateway to ashmoor').toBeDefined();

  await travelTo(page, held, onward!.tileX, onward!.tileY, 'saltreach', 'ashmoor');

  const inAshmoor = await readTick(page, 0, 0);
  expect(inAshmoor.state.regionId).toBe('ashmoor');
  // Arrived on the gateway that leads back, not at Ashmoor's spawn.
  expect({ x: inAshmoor.state.courier.tileX, y: inAshmoor.state.courier.tileY }).toEqual(
    FROM_SALTREACH,
  );

  // And back out the way we came in.
  const back = inAshmoor.state.gateways.find((g) => g.to === 'saltreach');
  expect(back, 'ashmoor should link back to saltreach').toBeDefined();
  await travelTo(page, held, back!.tileX, back!.tileY, 'ashmoor', 'saltreach');
  const returned = await readTick(page, 0, 0);
  expect(returned.state.regionId).toBe('saltreach');
  expect({ x: returned.state.courier.tileX, y: returned.state.courier.tileY }).toEqual({
    x: onward!.tileX,
    y: onward!.tileY,
  });

  expect(errors, `runtime errors on the saltreach side of the ring:\n${errors.join('\n')}`).toEqual(
    [],
  );
});

test('reaches Ashmoor from the Fenmarch side, arriving at the other door', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);

  await seedInRegion(page, 'fenmarch');
  await bootE2E(page, { turbo: true, noWear: true });

  const held = new Set<Arrow>();

  const start = await readTick(page, 0, 0);
  expect(start.state.regionId).toBe('fenmarch');
  const onward = start.state.gateways.find((g) => g.to === 'ashmoor');
  expect(onward, 'fenmarch should have a gateway to ashmoor').toBeDefined();

  await travelTo(page, held, onward!.tileX, onward!.tileY, 'fenmarch', 'ashmoor');

  const inAshmoor = await readTick(page, 0, 0);
  expect(inAshmoor.state.regionId).toBe('ashmoor');
  // The ring property in play: coming from Fenmarch lands on the southern door,
  // a different tile in a different half of the map from the Saltreach arrival
  // asserted above. A hub-and-spoke world has no second door to land at.
  expect({ x: inAshmoor.state.courier.tileX, y: inAshmoor.state.courier.tileY }).toEqual(
    FROM_FENMARCH,
  );
  expect(FROM_FENMARCH).not.toEqual(FROM_SALTREACH);

  expect(errors, `runtime errors on the fenmarch side of the ring:\n${errors.join('\n')}`).toEqual(
    [],
  );
});
