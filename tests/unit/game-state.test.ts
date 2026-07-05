import { describe, it, expect } from 'vitest';
import { createGameState, isUnlocked, unlock } from '../../src/systems/game-state';

describe('game-state', () => {
  it('starts with nothing unlocked', () => {
    const state = createGameState();
    expect(isUnlocked(state, 'ford-crossing')).toBe(false);
  });

  it('unlocks a feature and reports the change', () => {
    const state = createGameState();
    expect(unlock(state, 'ford-crossing')).toBe(true);
    expect(isUnlocked(state, 'ford-crossing')).toBe(true);
  });

  it('returns false when unlocking something already unlocked', () => {
    const state = createGameState();
    unlock(state, 'ford-crossing');
    expect(unlock(state, 'ford-crossing')).toBe(false);
  });

  it('keeps unlocks independent', () => {
    const state = createGameState();
    unlock(state, 'ford-crossing');
    expect(isUnlocked(state, 'other-route')).toBe(false);
  });
});
