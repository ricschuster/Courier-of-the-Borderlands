import { TILE_SIZE } from '../config/game-config';
import { addDistance, createTripLog, recordDelivery, type TripLog } from './trip-log';
import { levelForXp, totalXp } from './experience';

/**
 * Everything the courier's progress is counted from: distance driven, deliveries
 * made, settlements found, and the position sampler that turns sprite movement
 * into distance.
 *
 * Extracted from MapScene in #392. It needs no scene services at all, so it is a
 * pure module rather than a controller (ADR 0009, extraction shape 1) and lands
 * inside the coverage gate.
 *
 * The cohesion is not accidental: experience is derived from deliveries,
 * distance and discoveries, which is exactly the three things this owns, so the
 * courier's level comes out of here rather than being reassembled by the scene.
 */
export class TripTracker {
  private log_: TripLog = createTripLog();
  private visited_ = new Set<string>();
  /**
   * Last sampled courier position in world pixels. Distance is the delta between
   * samples, so whoever moves the courier without the courier driving there must
   * re-sync (see `syncTo`).
   */
  private prevX = 0;
  private prevY = 0;

  /** Adopt a restored run's counters. */
  restore(log: TripLog, visited: Set<string>): void {
    this.log_ = log;
    this.visited_ = visited;
  }

  /**
   * Move the sampler without booking any distance.
   *
   * For every jump the courier did not drive: the spawn, the rescue tow, and the
   * test harness placing the wagon. Skipping this would credit a teleport as
   * distance travelled, which is both wrong and an exploit, since distance is
   * experience and experience is levels: a stranded courier could farm XP by
   * paying for tows.
   */
  syncTo(x: number, y: number): void {
    this.prevX = x;
    this.prevY = y;
  }

  /**
   * Sample a new courier position, book the distance covered since the last
   * sample, and return the tiles moved.
   *
   * The return value is also the "is the wagon actually rolling" signal for the
   * audio bed: commanded velocity is non-zero while pressed into a mountain, and
   * a bed humming against a wall would be describing a drive that is not
   * happening (#383).
   */
  advance(x: number, y: number): number {
    const dx = x - this.prevX;
    const dy = y - this.prevY;
    this.prevX = x;
    this.prevY = y;
    const tiles = Math.hypot(dx, dy) / TILE_SIZE;
    if (tiles > 0) {
      this.log_ = addDistance(this.log_, tiles);
    }
    return tiles;
  }

  /** Book a completed delivery. */
  recordDelivery(): void {
    this.log_ = recordDelivery(this.log_);
  }

  /**
   * Record a settlement as found. Returns true only the first time, so the
   * caller can fire arrival lore exactly once.
   */
  visit(id: string): boolean {
    if (this.visited_.has(id)) {
      return false;
    }
    this.visited_.add(id);
    return true;
  }

  log(): TripLog {
    return this.log_;
  }

  visitedIds(): string[] {
    return [...this.visited_];
  }

  distanceTiles(): number {
    return this.log_.distanceTiles;
  }

  deliveries(): number {
    return this.log_.deliveries;
  }

  /** Settlements found. Feeds experience as "discoveries". */
  placesFound(): number {
    return this.visited_.size;
  }

  xp(): number {
    return totalXp({
      deliveries: this.log_.deliveries,
      distanceTiles: this.log_.distanceTiles,
      discoveries: this.visited_.size,
    });
  }

  level(): number {
    return levelForXp(this.xp());
  }
}
