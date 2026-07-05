// Minimal mutable game state and pure helpers. The scene owns one instance and
// passes it (or its unlock set) into pure logic, so there is no hidden global
// state. Currency and reputation will join this module in later steps.

export interface GameState {
  /** Ids of routes, shortcuts, and features the player has unlocked. */
  readonly unlocks: Set<string>;
}

export function createGameState(): GameState {
  return { unlocks: new Set<string>() };
}

export function isUnlocked(state: GameState, id: string): boolean {
  return state.unlocks.has(id);
}

/** Unlock a feature. Returns true if it was newly unlocked, false if already. */
export function unlock(state: GameState, id: string): boolean {
  if (state.unlocks.has(id)) {
    return false;
  }
  state.unlocks.add(id);
  return true;
}
