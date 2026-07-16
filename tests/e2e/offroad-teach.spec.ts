import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, driveToTile, readTick, type Arrow } from './drive';

// The off-road wear lesson: the first time the wagon is driven off the road onto
// rough ground, a one-time toast teaches that rough terrain wears the wagon and
// roads do not (#326). The blind run never learned this, which fed its stranded
// dead end. All input is genuine keyboard input.

test('driving off the road teaches the wear lesson once', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);

  await bootE2E(page);
  const held = new Set<Arrow>();

  // Spawn sits on the main road, so the lesson is not yet taught.
  const start = await readTick(page, 0, 0);
  expect(start.state.storyFlags).not.toContain('onboarding:offroad');

  // Drive off the road into the forest patch north of the spawn road; the wagon
  // crosses rough ground (plains then forest) while driving, firing the teach.
  await driveToTile(page, held, 8, 6);
  const after = await readTick(page, 8, 6);
  expect(after.state.storyFlags).toContain('onboarding:offroad');

  expect(errors, `runtime errors during off-road teach:\n${errors.join('\n')}`).toEqual([]);
});
