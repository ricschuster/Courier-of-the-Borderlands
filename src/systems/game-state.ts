// Mutable game-state holder plus pure unlock helpers. The scene owns one
// instance and passes it (or its fields) into pure logic, so there is no
// hidden global state. The ledger and upgrade set are reassigned with the new
// values returned by the pure economy and upgrade systems.
import { createLedger, type Ledger } from './economy';

export interface GameState {
  /** Ids of routes, shortcuts, and features the player has unlocked. */
  readonly unlocks: Set<string>;
  /** Coins and per-settlement reputation. Reassigned via the economy system. */
  ledger: Ledger;
  /** Ids of purchased vehicle upgrades. Reassigned via the upgrade system. */
  upgrades: Set<string>;
}

export function createGameState(): GameState {
  return { unlocks: new Set<string>(), ledger: createLedger(0), upgrades: new Set<string>() };
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
