import { describe, it, expect, beforeEach } from 'vitest';
import { TripTracker } from '../../src/systems/trip-tracker';
import { createTripLog } from '../../src/systems/trip-log';
import { TILE_SIZE } from '../../src/config/game-config';
import { levelForXp, totalXp } from '../../src/systems/experience';

// The trip cluster extracted from MapScene in #392. The counters themselves are
// covered in trip-log.test.ts and experience.test.ts; what is new here is the
// position sampler, and specifically the difference between driving somewhere and
// being put there.

describe('TripTracker', () => {
  let trip: TripTracker;

  beforeEach(() => {
    trip = new TripTracker();
    trip.syncTo(0, 0);
  });

  describe('distance', () => {
    it('books the distance between samples, in tiles', () => {
      const tiles = trip.advance(TILE_SIZE * 3, 0);

      expect(tiles).toBeCloseTo(3);
      expect(trip.distanceTiles()).toBeCloseTo(3);
    });

    it('accumulates across samples', () => {
      trip.advance(TILE_SIZE, 0);
      trip.advance(TILE_SIZE, TILE_SIZE);

      expect(trip.distanceTiles()).toBeCloseTo(2);
    });

    it('measures diagonally rather than per axis', () => {
      // A 3-4-5 triangle: five tiles, not seven.
      const tiles = trip.advance(TILE_SIZE * 3, TILE_SIZE * 4);
      expect(tiles).toBeCloseTo(5);
    });

    it('reports zero when the courier has not moved, which mutes the audio bed', () => {
      // Commanded velocity is non-zero while pressed into a mountain, so this is
      // the signal that the wagon is actually rolling (#383).
      expect(trip.advance(0, 0)).toBe(0);
      expect(trip.distanceTiles()).toBe(0);
    });
  });

  // The rule the extraction exists to make testable. Distance is experience and
  // experience is levels, so booking a teleport would let a stranded courier farm
  // XP by paying for tows.
  describe('syncTo does not book distance', () => {
    it('ignores a rescue tow across the map', () => {
      trip.advance(TILE_SIZE * 2, 0);
      const afterDriving = trip.distanceTiles();

      trip.syncTo(TILE_SIZE * 40, TILE_SIZE * 30);

      expect(trip.distanceTiles()).toBeCloseTo(afterDriving);
    });

    it('leaves the sampler at the new position, so the next drive is measured from there', () => {
      trip.syncTo(TILE_SIZE * 10, 0);
      const tiles = trip.advance(TILE_SIZE * 11, 0);

      expect(tiles).toBeCloseTo(1);
      expect(trip.distanceTiles()).toBeCloseTo(1);
    });

    it('earns no experience for being towed', () => {
      const before = trip.xp();
      trip.syncTo(TILE_SIZE * 40, TILE_SIZE * 30);

      expect(trip.xp()).toBe(before);
    });
  });

  describe('settlements found', () => {
    it('reports a first visit once and never again', () => {
      expect(trip.visit('greywater')).toBe(true);
      expect(trip.visit('greywater')).toBe(false);
      expect(trip.placesFound()).toBe(1);
    });

    it('tracks each settlement separately', () => {
      trip.visit('greywater');
      trip.visit('eastwatch');

      expect(trip.placesFound()).toBe(2);
      expect(trip.visitedIds().sort()).toEqual(['eastwatch', 'greywater']);
    });
  });

  describe('deliveries', () => {
    it('counts each delivery', () => {
      trip.recordDelivery();
      trip.recordDelivery();

      expect(trip.deliveries()).toBe(2);
    });
  });

  describe('experience', () => {
    it('derives from deliveries, distance and places found together', () => {
      trip.advance(TILE_SIZE * 12, 0);
      trip.recordDelivery();
      trip.visit('greywater');

      expect(trip.xp()).toBe(
        totalXp({ deliveries: 1, distanceTiles: 12, discoveries: 1 }),
      );
      expect(trip.level()).toBe(levelForXp(trip.xp()));
    });

    it('starts a fresh courier at level 1 with nothing banked', () => {
      expect(trip.xp()).toBe(0);
      expect(trip.level()).toBe(levelForXp(0));
    });
  });

  describe('restore', () => {
    it('adopts a loaded run and keeps counting from it', () => {
      trip.restore({ ...createTripLog(), distanceTiles: 20, deliveries: 4 }, new Set(['fenholt']));

      expect(trip.distanceTiles()).toBe(20);
      expect(trip.deliveries()).toBe(4);
      expect(trip.placesFound()).toBe(1);
      expect(trip.visit('fenholt')).toBe(false);

      trip.syncTo(0, 0);
      trip.advance(TILE_SIZE, 0);
      expect(trip.distanceTiles()).toBeCloseTo(21);
    });
  });
});
