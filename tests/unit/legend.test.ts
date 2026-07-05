import { describe, it, expect } from 'vitest';
import { buildLegend } from '../../src/systems/legend';
import type { LegendTerrain } from '../../src/systems/legend';

// Fixture covering every speedLabel branch plus impassable edge cases.
const TERRAINS: readonly LegendTerrain[] = [
  // fast: passable, speedModifier > 1
  { name: 'Paved Road', color: 0xaaaaaa, passable: true, speedModifier: 1.5 },
  // normal: passable, speedModifier === 1
  { name: 'Dirt Path', color: 0xc8a46e, passable: true, speedModifier: 1.0 },
  // slow: passable, speedModifier < 1
  { name: 'Marshland', color: 0x4a7c59, passable: true, speedModifier: 0.5 },
  // blocked: not passable, speedModifier === 0
  { name: 'Deep River', color: 0x2255aa, passable: false, speedModifier: 0 },
  // blocked: not passable even when speedModifier > 0 (edge case)
  { name: 'Cliff Face', color: 0x888888, passable: false, speedModifier: 1.2 },
];

describe('buildLegend', () => {
  it('returns one entry per input terrain', () => {
    const entries = buildLegend(TERRAINS);
    expect(entries).toHaveLength(TERRAINS.length);
  });

  it('labels a fast passable terrain as "fast"', () => {
    const entries = buildLegend(TERRAINS);
    const entry = entries[0];
    expect(entry?.speedLabel).toBe('fast');
  });

  it('labels a normal-speed passable terrain as "normal"', () => {
    const entries = buildLegend(TERRAINS);
    const entry = entries[1];
    expect(entry?.speedLabel).toBe('normal');
  });

  it('labels a slow passable terrain as "slow"', () => {
    const entries = buildLegend(TERRAINS);
    const entry = entries[2];
    expect(entry?.speedLabel).toBe('slow');
  });

  it('labels an impassable terrain (speedModifier 0) as "blocked"', () => {
    const entries = buildLegend(TERRAINS);
    const entry = entries[3];
    expect(entry?.speedLabel).toBe('blocked');
  });

  it('labels an impassable terrain (speedModifier > 0) as "blocked"', () => {
    // passable flag takes priority over speedModifier value
    const entries = buildLegend(TERRAINS);
    const entry = entries[4];
    expect(entry?.speedLabel).toBe('blocked');
  });

  it('preserves input order', () => {
    const entries = buildLegend(TERRAINS);
    const names = entries.map((e) => e.name);
    expect(names).toEqual([
      'Paved Road',
      'Dirt Path',
      'Marshland',
      'Deep River',
      'Cliff Face',
    ]);
  });

  it('copies name, color, and passable through unchanged', () => {
    const entries = buildLegend(TERRAINS);
    for (let i = 0; i < TERRAINS.length; i++) {
      const source = TERRAINS[i];
      const entry = entries[i];
      // Both are defined by construction; guard for noUncheckedIndexedAccess.
      if (source === undefined || entry === undefined) throw new Error('unexpected undefined');
      expect(entry.name).toBe(source.name);
      expect(entry.color).toBe(source.color);
      expect(entry.passable).toBe(source.passable);
    }
  });

  it('returns an empty array for empty input', () => {
    expect(buildLegend([])).toEqual([]);
  });
});
