import { describe, it, expect } from 'vitest';
import {
  GAME_TITLE,
  GAME_WIDTH,
  GAME_HEIGHT,
  WARM_GOLD,
  WARM_GOLD_CSS,
  COURIER_COLOR,
  UI_ACCENT_CSS,
} from '../../src/config/game-config';

// Smoke test proving the Vitest pipeline runs against real source modules.
// Replaced and expanded by system tests (terrain, fog-of-war, contracts) later.
describe('game-config', () => {
  it('exposes the game title', () => {
    expect(GAME_TITLE).toBe('Courier of the Borderlands');
  });

  it('uses a positive 16:9 render resolution', () => {
    expect(GAME_WIDTH).toBeGreaterThan(0);
    expect(GAME_HEIGHT).toBeGreaterThan(0);
    expect(GAME_WIDTH / GAME_HEIGHT).toBeCloseTo(16 / 9, 5);
  });

  // #364. Phaser needs the palette gold in two forms (numeric for Graphics and
  // tints, CSS string for text styles), and nothing stops the two from drifting
  // apart on an edit. This is the guard: change one form and this fails.
  it('keeps both forms of the palette gold in agreement', () => {
    expect(WARM_GOLD_CSS).toBe(`#${WARM_GOLD.toString(16).padStart(6, '0')}`);
  });

  // The roles share one value today but are named apart on purpose, so this
  // asserts they resolve to the palette rather than asserting they are equal to
  // each other: repainting one role should not need this test edited.
  it('derives the gold roles from the palette', () => {
    expect(COURIER_COLOR).toBe(WARM_GOLD);
    expect(UI_ACCENT_CSS).toBe(WARM_GOLD_CSS);
  });
});
