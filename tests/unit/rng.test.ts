import { describe, it, expect } from 'vitest';
import { createRng } from '../../src/systems/rng';

describe('createRng', () => {
  it('is deterministic: the same seed yields the same sequence', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = [a.next(), a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('returns floats in [0, 1)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('coerces equivalent seeds (a negative and its 32-bit form) to the same stream', () => {
    // -1 >>> 0 === 0xffffffff, so both seed the generator identically.
    const a = createRng(-1);
    const b = createRng(0xffffffff);
    expect(a.next()).toBe(b.next());
  });

  describe('nextInt', () => {
    it('stays within [0, maxExclusive)', () => {
      const rng = createRng(7);
      for (let i = 0; i < 1000; i++) {
        const v = rng.nextInt(4);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(4);
      }
    });

    it('covers every value in a small range given enough draws', () => {
      const rng = createRng(42);
      const seen = new Set<number>();
      for (let i = 0; i < 500; i++) {
        seen.add(rng.nextInt(4));
      }
      expect(seen).toEqual(new Set([0, 1, 2, 3]));
    });

    it('returns 0 for a non-positive bound', () => {
      const rng = createRng(3);
      expect(rng.nextInt(0)).toBe(0);
      expect(rng.nextInt(-5)).toBe(0);
    });
  });

  describe('pick', () => {
    it('returns undefined for an empty array', () => {
      const rng = createRng(1);
      expect(rng.pick([])).toBeUndefined();
    });

    it('only ever returns elements of the array', () => {
      const rng = createRng(2024);
      const items = ['a', 'b', 'c'] as const;
      for (let i = 0; i < 300; i++) {
        expect(items).toContain(rng.pick(items));
      }
    });

    it('is deterministic for a given seed', () => {
      const items = ['x', 'y', 'z', 'w'];
      const a = createRng(555);
      const b = createRng(555);
      const drawsA = Array.from({ length: 10 }, () => a.pick(items));
      const drawsB = Array.from({ length: 10 }, () => b.pick(items));
      expect(drawsA).toEqual(drawsB);
    });
  });
});
