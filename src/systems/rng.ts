// Seeded pseudo-random number generator. Pure and deterministic: the same seed
// always yields the same sequence, so anything built on it (weather rolls,
// future content variation) is reproducible and unit-testable. No Phaser, no
// global Math.random.
//
// The core is mulberry32: a small, fast 32-bit generator with quality good
// enough for gameplay flavour. It is not cryptographically secure and is not
// meant to be.

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [0, maxExclusive). Returns 0 when maxExclusive <= 0. */
  nextInt(maxExclusive: number): number;
  /** Uniformly pick one element, or undefined when the array is empty. */
  pick<T>(items: readonly T[]): T | undefined;
}

/**
 * Create a seeded RNG. The seed is coerced to a 32-bit unsigned integer, so any
 * finite number works; the same seed reproduces the same sequence.
 */
export function createRng(seed: number): Rng {
  // mulberry32 keeps a single 32-bit unsigned integer of state.
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    nextInt(maxExclusive: number): number {
      if (maxExclusive <= 0) {
        return 0;
      }
      return Math.floor(next() * maxExclusive);
    },
    pick<T>(items: readonly T[]): T | undefined {
      if (items.length === 0) {
        return undefined;
      }
      return items[Math.floor(next() * items.length)];
    },
  };
}
