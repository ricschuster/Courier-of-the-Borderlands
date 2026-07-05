import { describe, it, expect } from 'vitest';
import {
  createTripLog,
  addDistance,
  recordDelivery,
  formatDistance,
} from '../../src/systems/trip-log';

describe('createTripLog', () => {
  it('defaults both fields to 0', () => {
    const log = createTripLog();
    expect(log.distanceTiles).toBe(0);
    expect(log.deliveries).toBe(0);
  });

  it('accepts explicit positive values', () => {
    const log = createTripLog(10, 3);
    expect(log.distanceTiles).toBe(10);
    expect(log.deliveries).toBe(3);
  });

  it('clamps negative distanceTiles to 0', () => {
    expect(createTripLog(-5, 0).distanceTiles).toBe(0);
  });

  it('clamps negative deliveries to 0', () => {
    expect(createTripLog(0, -2).deliveries).toBe(0);
  });

  it('treats NaN distanceTiles as 0', () => {
    expect(createTripLog(NaN, 0).distanceTiles).toBe(0);
  });

  it('treats NaN deliveries as 0', () => {
    expect(createTripLog(0, NaN).deliveries).toBe(0);
  });

  it('treats Infinity as 0', () => {
    expect(createTripLog(Infinity, Infinity).distanceTiles).toBe(0);
    expect(createTripLog(Infinity, Infinity).deliveries).toBe(0);
  });
});

describe('addDistance', () => {
  it('accumulates distance across multiple calls', () => {
    const a = createTripLog();
    const b = addDistance(a, 5);
    const c = addDistance(b, 3.5);
    expect(c.distanceTiles).toBeCloseTo(8.5);
  });

  it('returns a new object and does not mutate the input', () => {
    const original = createTripLog(10, 1);
    const updated = addDistance(original, 4);
    expect(updated).not.toBe(original);
    expect(original.distanceTiles).toBe(10); // unchanged
  });

  it('preserves deliveries count', () => {
    const log = createTripLog(0, 2);
    expect(addDistance(log, 5).deliveries).toBe(2);
  });

  it('ignores negative tiles', () => {
    const log = createTripLog(10, 0);
    expect(addDistance(log, -3).distanceTiles).toBe(10);
  });

  it('ignores NaN tiles', () => {
    const log = createTripLog(10, 0);
    expect(addDistance(log, NaN).distanceTiles).toBe(10);
  });

  it('ignores Infinity tiles', () => {
    const log = createTripLog(10, 0);
    expect(addDistance(log, Infinity).distanceTiles).toBe(10);
  });

  it('ignores -Infinity tiles', () => {
    const log = createTripLog(10, 0);
    expect(addDistance(log, -Infinity).distanceTiles).toBe(10);
  });
});

describe('recordDelivery', () => {
  it('increments deliveries by 1', () => {
    const log = createTripLog(0, 0);
    expect(recordDelivery(log).deliveries).toBe(1);
  });

  it('can be called multiple times', () => {
    let log = createTripLog();
    log = recordDelivery(log);
    log = recordDelivery(log);
    log = recordDelivery(log);
    expect(log.deliveries).toBe(3);
  });

  it('returns a new object and does not mutate the input', () => {
    const original = createTripLog(0, 2);
    const updated = recordDelivery(original);
    expect(updated).not.toBe(original);
    expect(original.deliveries).toBe(2); // unchanged
  });

  it('preserves distanceTiles', () => {
    const log = createTripLog(7.5, 0);
    expect(recordDelivery(log).distanceTiles).toBe(7.5);
  });
});

describe('formatDistance', () => {
  it('formats 0 as "0.0 leagues"', () => {
    expect(formatDistance(0)).toBe('0.0 leagues');
  });

  it('formats an integer with one decimal place', () => {
    expect(formatDistance(5)).toBe('5.0 leagues');
  });

  it('rounds to one decimal place', () => {
    expect(formatDistance(12.34)).toBe('12.3 leagues');
  });

  it('rounds up correctly', () => {
    // 12.36 avoids the float representation of 12.35 (stored as 12.3499...).
    expect(formatDistance(12.36)).toBe('12.4 leagues');
  });

  it('handles a large value', () => {
    expect(formatDistance(1000)).toBe('1000.0 leagues');
  });
});
