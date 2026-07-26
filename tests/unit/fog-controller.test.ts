import { describe, it, expect, beforeEach } from 'vitest';
import { FogController, type FogHost } from '../../src/scenes/fog-controller';
import { revealedIndices } from '../../src/systems/fog-of-war';

// The fog cluster extracted from MapScene in #392. The reveal maths itself is
// pure and covered in fog-of-war.test.ts; what is new here is the sequencing
// against the scene lifecycle, and specifically the *reload* path. ADR 0009
// records that this file's surfaces were repeatedly verified on the path that
// creates them and not the path that restores them, and the stale-dimension
// branch below is exactly that shape: it only runs for a returning player whose
// region has been resized since their save.

/** Stands in for the terrain layer, recording which rectangles were cleared. */
class FakeHost implements FogHost {
  width = 20;
  height = 11;
  regionId = 'greybridge';
  clearedIndices: number[] = [];
  clearedTiles: { x: number; y: number }[] = [];

  getMapSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
  getRegionId(): string {
    return this.regionId;
  }
  clearFogAt = (indices: Iterable<number>): void => {
    this.clearedIndices.push(...indices);
  };
  clearFogAtTiles = (tiles: Iterable<{ x: number; y: number }>): void => {
    this.clearedTiles.push(...tiles);
  };
}

describe('FogController', () => {
  let host: FakeHost;
  let fog: FogController;

  beforeEach(() => {
    host = new FakeHost();
    fog = new FogController(host);
  });

  describe('a fresh run', () => {
    it('starts fully unrevealed and clears nothing', () => {
      fog.beginRegion();

      expect(revealedIndices(fog.current())).toEqual([]);
      expect(host.clearedIndices).toEqual([]);
      expect(fog.isRevealed(5, 5)).toBe(false);
    });

    it('sizes the fog to the current map', () => {
      fog.beginRegion();

      expect(fog.current().width).toBe(20);
      expect(fog.current().height).toBe(11);
    });
  });

  describe('revealing', () => {
    beforeEach(() => {
      fog.beginRegion();
    });

    it('reveals a radius and clears exactly those rectangles', () => {
      const revealed = fog.revealAround({ x: 5, y: 5 }, 1);

      expect(fog.isRevealed(5, 5)).toBe(true);
      expect(fog.isRevealed(5, 4)).toBe(true);
      expect(fog.isRevealed(5, 3)).toBe(false);
      expect(host.clearedTiles).toEqual(revealed);
    });

    it('returns only newly revealed tiles, so a discovery fires once', () => {
      fog.revealAround({ x: 5, y: 5 }, 1);
      const second = fog.revealAround({ x: 5, y: 5 }, 1);

      expect(second).toEqual([]);
    });
  });

  describe('the reload path', () => {
    it('re-reveals what the save recorded for this region', () => {
      // Tiles (0,0), (1,0) and (0,1) on a 20-wide map.
      fog.restore({ greybridge: [0, 1, 20] }, { greybridge: [20, 11] });
      fog.beginRegion();

      expect(fog.isRevealed(0, 0)).toBe(true);
      expect(fog.isRevealed(1, 0)).toBe(true);
      expect(fog.isRevealed(0, 1)).toBe(true);
      expect(fog.isRevealed(2, 0)).toBe(false);
      expect(host.clearedIndices).toEqual([0, 1, 20]);
    });

    it('leaves other regions untouched and restores them on arrival', () => {
      fog.restore({ greybridge: [0], fenmarch: [5] }, { greybridge: [20, 11], fenmarch: [20, 11] });
      fog.beginRegion();

      expect(fog.isRevealed(0, 0)).toBe(true);
      expect(fog.isRevealed(5, 0)).toBe(false);

      // Travel to the other region: a new scene, the same persisted record.
      host.regionId = 'fenmarch';
      host.clearedIndices = [];
      fog.beginRegion();

      expect(fog.isRevealed(5, 0)).toBe(true);
      expect(fog.isRevealed(0, 0)).toBe(false);
      expect(host.clearedIndices).toEqual([5]);
    });

    it('discards saved fog when the region has been resized since the save', () => {
      // Indices are row-major, so they only mean the same tile at the same
      // width. A resized region must start fresh rather than reveal wrong tiles.
      fog.restore({ greybridge: [0, 1, 20] }, { greybridge: [30, 22] });
      fog.beginRegion();

      expect(revealedIndices(fog.current())).toEqual([]);
      expect(host.clearedIndices).toEqual([]);
    });

    it('discards saved fog that predates dimension tracking', () => {
      fog.restore({ greybridge: [0, 1, 20] }, {});
      fog.beginRegion();

      expect(revealedIndices(fog.current())).toEqual([]);
    });

    it('drops the stale entry so the next save does not carry it forward', () => {
      fog.restore({ greybridge: [0, 1, 20] }, { greybridge: [30, 22] });
      fog.beginRegion();
      fog.revealAround({ x: 5, y: 5 }, 0);

      const saved = fog.snapshot();
      // Rewritten from the live fog at the current size, not the stale indices.
      expect(saved.fogByRegion.greybridge).toEqual([revealIndexOf(5, 5)]);
      expect(saved.fogDimsByRegion.greybridge).toEqual([20, 11]);
    });

    it('ignores out-of-range indices from a hand-edited or truncated save', () => {
      fog.restore({ greybridge: [0, 9999, -1] }, { greybridge: [20, 11] });
      fog.beginRegion();

      expect(fog.isRevealed(0, 0)).toBe(true);
      expect(revealedIndices(fog.current())).toEqual([0]);
      expect(host.clearedIndices).toEqual([0]);
    });
  });

  describe('snapshot', () => {
    it('records the active region against the current map size', () => {
      fog.beginRegion();
      fog.revealAround({ x: 3, y: 2 }, 0);

      const saved = fog.snapshot();

      expect(saved.fogByRegion.greybridge).toEqual([revealIndexOf(3, 2)]);
      expect(saved.fogDimsByRegion.greybridge).toEqual([20, 11]);
    });

    it('round-trips through a restore', () => {
      fog.beginRegion();
      fog.revealAround({ x: 7, y: 4 }, 2);
      const saved = fog.snapshot();
      const before = revealedIndices(fog.current());

      const reloaded = new FogController(host);
      reloaded.restore(saved.fogByRegion, saved.fogDimsByRegion);
      reloaded.beginRegion();

      expect(revealedIndices(reloaded.current())).toEqual(before);
    });

    it('keeps a region explored on a previous visit', () => {
      fog.beginRegion();
      fog.revealAround({ x: 1, y: 1 }, 0);
      fog.snapshot();

      host.regionId = 'fenmarch';
      fog.beginRegion();
      const saved = fog.snapshot();

      expect(saved.fogByRegion.greybridge).toEqual([revealIndexOf(1, 1)]);
      expect(saved.fogByRegion.fenmarch).toEqual([]);
    });
  });
});

/** Row-major index of a tile on the 20-wide fixture map. */
function revealIndexOf(x: number, y: number): number {
  return y * 20 + x;
}
