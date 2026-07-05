// Pure movement logic. No Phaser here so it can be unit tested directly.
// Turns a set of directional inputs into a velocity vector, normalising
// diagonals so the courier does not move faster on a diagonal.

export interface MoveInput {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

/**
 * Velocity for the given input at the given speed (pixels per second).
 * Opposing inputs cancel out; diagonals are normalised to the same speed as
 * cardinal directions. Screen coordinates: +y is down.
 */
export function computeVelocity(input: MoveInput, speed: number): Vector2 {
  let x = 0;
  let y = 0;
  if (input.left) x -= 1;
  if (input.right) x += 1;
  if (input.up) y -= 1;
  if (input.down) y += 1;

  if (x === 0 && y === 0) {
    return { x: 0, y: 0 };
  }

  const length = Math.hypot(x, y);
  return { x: (x / length) * speed, y: (y / length) * speed };
}
