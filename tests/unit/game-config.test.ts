import { describe, it, expect } from 'vitest';
import { GAME_TITLE, GAME_WIDTH, GAME_HEIGHT } from '../../src/config/game-config';

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
});
