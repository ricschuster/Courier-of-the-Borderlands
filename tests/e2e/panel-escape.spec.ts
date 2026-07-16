import { test, expect } from '@playwright/test';
import { bootE2E, collectErrors, pressUntil, readTick, setSkillPanel } from './drive';

// Esc should close an open blocking overlay, not only its own toggle key (#319).
// The dialogue teaches "Esc to step away", but the skills panel used to close
// only with K, so a player who learned Esc was stuck looking at it. All input is
// genuine keyboard input through Phaser.

test('Esc closes the open skills panel', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);

  await bootE2E(page);

  // Open the skills panel with its toggle, then close it with Esc (not K).
  await setSkillPanel(page, true);
  expect((await readTick(page, 0, 0)).state.skillPanelOpen).toBe(true);

  await pressUntil(page, 'Escape', async () => !(await readTick(page, 0, 0)).state.skillPanelOpen);
  expect((await readTick(page, 0, 0)).state.skillPanelOpen).toBe(false);

  expect(errors, `runtime errors closing the skills panel:\n${errors.join('\n')}`).toEqual([]);
});
