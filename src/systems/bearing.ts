// Pure compass-bearing helper for the objective wayfinding cue. Players could
// not tell which way to drive to a still-fogged destination (Session 3
// playtest): the HUD named the place but nothing pointed at it. Since every
// target's tile is known even under fog, a cardinal direction is always
// available. See docs/design/05_playtest_notes.md.

export interface TilePoint {
  readonly x: number;
  readonly y: number;
}

// Tile coordinates are screen-space: x grows east (right), y grows south (down).
// So "north" is a smaller y. Index into this table with the 45-degree sector,
// measured clockwise from north.
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export type CompassLabel = (typeof COMPASS)[number];

/**
 * The eight-point compass label from `from` toward `to`, or null when they are
 * the same tile (no meaningful direction).
 */
export function bearingLabel(from: TilePoint, to: TilePoint): CompassLabel | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) {
    return null;
  }
  // atan2(east, north): 0 rad points north and the angle grows clockwise, so
  // dividing by 45 degrees and rounding lands on the nearest compass sector.
  const angle = Math.atan2(dx, -dy);
  const sector = Math.round((angle * 180) / Math.PI / 45);
  const index = ((sector % 8) + 8) % 8;
  // index is provably in 0..7, so the lookup is always defined.
  return COMPASS[index] as CompassLabel;
}
