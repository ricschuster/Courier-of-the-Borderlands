import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, readTick, travelTo, type Arrow } from './drive';

// Input-driven travel test. Drives to a region gateway, travels with the "T"
// key, and asserts the courier arrives standing on the return gateway (the
// travel marker) in the destination region, not at that region's spawn point.
// This guards the hub layout (Greybridge links to both spokes) and the
// arrival-at-marker behaviour: travelling back must land at the gateway you
// would leave from, not at the start of the region. Shared helpers live in
// ./drive.

test('travels to a spoke and back, arriving at the return gateway each way', async ({ page }) => {
  test.setTimeout(90_000);

  const errors = collectErrors(page);

  await bootE2E(page);

  const held = new Set<Arrow>();

  // Fresh boot in the Greybridge hub with no cargo, so travel is allowed.
  const start = await readTick(page, 0, 0);
  expect(start.state.regionId).toBe('greybridge');
  expect(start.state.activeContractId).toBeNull();

  // The hub links out to Saltreach (east, tile 19,5). Drive there and travel.
  const toSaltreach = start.state.gateways.find((g) => g.to === 'saltreach');
  expect(toSaltreach, 'greybridge should have a gateway to saltreach').toBeDefined();
  await travelTo(page, held, toSaltreach!.tileX, toSaltreach!.tileY, 'greybridge', 'saltreach');

  // Arrived in Saltreach: the courier must stand on the gateway that leads back
  // to Greybridge (the return marker), not at the Saltreach spawn.
  const inSaltreach = await readTick(page, 0, 0);
  expect(inSaltreach.state.regionId).toBe('saltreach');
  const saltBack = inSaltreach.state.gateways.find((g) => g.to === 'greybridge');
  expect(saltBack, 'saltreach should link back to greybridge').toBeDefined();
  expect({ x: inSaltreach.state.courier.tileX, y: inSaltreach.state.courier.tileY }).toEqual({
    x: saltBack!.tileX,
    y: saltBack!.tileY,
  });

  // Travel back through that same gateway to the hub.
  await travelTo(page, held, saltBack!.tileX, saltBack!.tileY, 'saltreach', 'greybridge');

  // Back in Greybridge, the courier must land on the gateway to Saltreach
  // (the marker at 19,5), NOT at the region's spawn (1,5). This is the bug the
  // arrival-at-marker change fixes: travelling back used to dump the courier at
  // the region start.
  const backHome = await readTick(page, 0, 0);
  expect(backHome.state.regionId).toBe('greybridge');
  expect({ x: backHome.state.courier.tileX, y: backHome.state.courier.tileY }).toEqual({
    x: toSaltreach!.tileX,
    y: toSaltreach!.tileY,
  });
  // Guard against a regression back to spawn placement.
  expect(backHome.state.courier.tileX).not.toBe(1);

  expect(errors, `runtime errors during travel run:\n${errors.join('\n')}`).toEqual([]);
});
