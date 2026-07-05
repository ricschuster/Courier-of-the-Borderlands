import { describe, it, expect } from 'vitest';
import { computeVelocity, type MoveInput } from '../../src/systems/movement';

const NONE: MoveInput = { up: false, down: false, left: false, right: false };
const SPEED = 100;

describe('computeVelocity', () => {
  it('returns zero when there is no input', () => {
    expect(computeVelocity(NONE, SPEED)).toEqual({ x: 0, y: 0 });
  });

  it('moves at full speed in cardinal directions', () => {
    expect(computeVelocity({ ...NONE, right: true }, SPEED)).toEqual({ x: SPEED, y: 0 });
    expect(computeVelocity({ ...NONE, left: true }, SPEED)).toEqual({ x: -SPEED, y: 0 });
    expect(computeVelocity({ ...NONE, up: true }, SPEED)).toEqual({ x: 0, y: -SPEED });
    expect(computeVelocity({ ...NONE, down: true }, SPEED)).toEqual({ x: 0, y: SPEED });
  });

  it('normalises diagonals to the same speed', () => {
    const v = computeVelocity({ ...NONE, up: true, right: true }, SPEED);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(SPEED, 5);
    expect(v.x).toBeCloseTo(SPEED / Math.SQRT2, 5);
    expect(v.y).toBeCloseTo(-SPEED / Math.SQRT2, 5);
  });

  it('cancels opposing inputs', () => {
    expect(computeVelocity({ ...NONE, left: true, right: true }, SPEED)).toEqual({ x: 0, y: 0 });
    expect(computeVelocity({ up: true, down: true, left: true, right: true }, SPEED)).toEqual({
      x: 0,
      y: 0,
    });
  });
});
