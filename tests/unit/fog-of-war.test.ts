import { describe, it, expect } from 'vitest';
import {
  createFog,
  isRevealed,
  revealAround,
  revealedIndices,
  revealIndices,
  fogFromRevealed,
  fogDimsMatch,
  effectiveRevealRadius,
} from '../../src/systems/fog-of-war';

describe('fog-of-war', () => {
  it('starts fully hidden', () => {
    const fog = createFog(5, 4);
    expect(fog.width).toBe(5);
    expect(fog.height).toBe(4);
    expect(isRevealed(fog, 0, 0)).toBe(false);
    expect(isRevealed(fog, 4, 3)).toBe(false);
  });

  it('reveals tiles within the radius and reports them', () => {
    const fog = createFog(5, 5);
    const revealed = revealAround(fog, 2, 2, 1);
    // Radius 1 (Euclidean) reveals the centre and the four orthogonal neighbours.
    const keys = revealed.map((t) => `${t.x},${t.y}`).sort();
    expect(keys).toEqual(['1,2', '2,1', '2,2', '2,3', '3,2'].sort());
    expect(isRevealed(fog, 2, 2)).toBe(true);
    expect(isRevealed(fog, 1, 2)).toBe(true);
    // A diagonal is outside radius 1 (distance sqrt(2)).
    expect(isRevealed(fog, 1, 1)).toBe(false);
  });

  it('does not re-report already revealed tiles', () => {
    const fog = createFog(5, 5);
    revealAround(fog, 2, 2, 1);
    const second = revealAround(fog, 2, 2, 1);
    expect(second).toEqual([]);
  });

  it('reveals new tiles when moving to an overlapping area', () => {
    const fog = createFog(6, 3);
    revealAround(fog, 1, 1, 1);
    const moved = revealAround(fog, 2, 1, 1);
    // (2,1) already revealed as a neighbour; (3,1) is new.
    const keys = moved.map((t) => `${t.x},${t.y}`);
    expect(keys).toContain('3,1');
    expect(keys).not.toContain('2,1');
  });

  it('round-trips through revealed indices for saving', () => {
    const fog = createFog(6, 3);
    revealAround(fog, 1, 1, 1);
    const indices = revealedIndices(fog);
    const restored = fogFromRevealed(6, 3, indices);
    expect(restored.revealed).toEqual(fog.revealed);
    // Spot-check a revealed and an unrevealed tile survived the round trip.
    expect(isRevealed(restored, 1, 1)).toBe(true);
    expect(isRevealed(restored, 5, 2)).toBe(false);
  });

  it('ignores out-of-range indices when rebuilding', () => {
    const fog = fogFromRevealed(3, 3, [0, 8, -1, 99]);
    expect(isRevealed(fog, 0, 0)).toBe(true);
    expect(isRevealed(fog, 2, 2)).toBe(true);
    expect(revealedIndices(fog)).toEqual([0, 8]);
  });

  // revealIndices applies saved fog onto the live fog and reports back what it
  // actually revealed, which is what the scene redraws. A resized region can
  // carry indices past the end of the current fog, so the bounds check and the
  // returned list have to agree: redrawing a tile that was not revealed would
  // punch a hole in the fog.
  describe('revealIndices', () => {
    it('reveals the listed tiles and returns them', () => {
      const fog = createFog(3, 3);
      expect(revealIndices(fog, [0, 4, 8])).toEqual([0, 4, 8]);
      expect(isRevealed(fog, 0, 0)).toBe(true);
      expect(isRevealed(fog, 1, 1)).toBe(true);
      expect(isRevealed(fog, 2, 2)).toBe(true);
      expect(isRevealed(fog, 1, 0)).toBe(false);
    });

    it('drops out-of-range indices from both the fog and the returned list', () => {
      const fog = createFog(3, 3);
      expect(revealIndices(fog, [-1, 0, 9, 99, 8])).toEqual([0, 8]);
      expect(revealedIndices(fog)).toEqual([0, 8]);
    });

    it('adds to what is already revealed rather than replacing it', () => {
      const fog = createFog(3, 3);
      revealIndices(fog, [0]);
      expect(revealIndices(fog, [4])).toEqual([4]);
      expect(revealedIndices(fog)).toEqual([0, 4]);
    });

    it('reveals nothing for an empty list', () => {
      const fog = createFog(3, 3);
      expect(revealIndices(fog, [])).toEqual([]);
      expect(revealedIndices(fog)).toEqual([]);
    });
  });

  it('clamps to map bounds without error', () => {
    const fog = createFog(3, 3);
    const revealed = revealAround(fog, 0, 0, 2);
    for (const tile of revealed) {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(3);
      expect(tile.y).toBeLessThan(3);
    }
    expect(isRevealed(fog, -1, 0)).toBe(false);
    expect(isRevealed(fog, 3, 3)).toBe(false);
  });

  describe('fogDimsMatch', () => {
    it('matches only when both dimensions equal the current map size', () => {
      expect(fogDimsMatch([20, 11], 20, 11)).toBe(true);
      expect(fogDimsMatch([20, 11], 30, 22)).toBe(false);
      expect(fogDimsMatch([20, 11], 20, 22)).toBe(false);
      expect(fogDimsMatch([20, 11], 30, 11)).toBe(false);
    });

    it('treats a missing stored size (pre-dimension save) as stale', () => {
      expect(fogDimsMatch(undefined, 20, 11)).toBe(false);
    });
  });

  // Extracted from MapScene.revealAroundCourier in #392, where it had no test:
  // the three sources were summed and clamped inline.
  describe('effectiveRevealRadius', () => {
    it('sums the upgrade radius, the skill bonus, and the weather bonus', () => {
      expect(effectiveRevealRadius(3, 1, 0)).toBe(4);
      expect(effectiveRevealRadius(4.5, 2, 1)).toBeCloseTo(7.5);
    });

    it('lets bad weather cut the radius down', () => {
      expect(effectiveRevealRadius(3, 0, -1)).toBe(2);
    });

    it('never falls below 1, so bad weather cannot blind the courier', () => {
      // A base of 3 with a -5 weather bonus would otherwise reveal nothing at
      // all, leaving the player unable to see the tile they are standing on.
      expect(effectiveRevealRadius(3, 0, -5)).toBe(1);
      expect(effectiveRevealRadius(0, 0, 0)).toBe(1);
    });
  });
});
