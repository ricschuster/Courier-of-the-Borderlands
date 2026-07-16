import { describe, it, expect } from 'vitest';
import {
  serialize,
  deserialize,
  migrateSaveData,
  migrateUnlocks,
  SAVE_VERSION,
  type GameSnapshot,
} from '../../src/systems/save-system';

const SNAPSHOT: GameSnapshot = {
  coins: 120,
  reputation: { eastwatch: 2, southmill: 3 },
  unlocks: ['ford-crossing-greybridge'],
  upgrades: ['reinforced-wheels'],
  completed: ['letters-to-eastwatch'],
  visited: ['greywater', 'eastwatch'],
  regionId: 'greybridge',
  fogByRegion: { greybridge: [0, 1, 2, 21, 22], saltreach: [5, 6] },
  fogDimsByRegion: { greybridge: [20, 11], saltreach: [18, 11] },
  activeContractId: 'grain-to-southmill',
  contractStatus: 'carrying',
  distanceTiles: 42.5,
  deliveries: 1,
  wagonCondition: 73,
  achievements: ['first-delivery', 'ford-finder'],
  skills: { 'off-road': 2, wayfinder: 1 },
  storyFlags: ['greybridge_reveal', 'met_postmaster'],
  courierTile: { x: 7, y: 4 },
};

describe('save-system', () => {
  it('stamps the current version on serialize', () => {
    expect(serialize(SNAPSHOT).version).toBe(SAVE_VERSION);
  });

  it('round-trips a valid snapshot', () => {
    expect(deserialize(serialize(SNAPSHOT))).toEqual(SNAPSHOT);
  });

  it('defaults wagonCondition to full for a save made before it existed', () => {
    const legacy = { ...serialize(SNAPSHOT) } as unknown as Record<string, unknown>;
    delete legacy.wagonCondition;
    expect(deserialize(legacy)?.wagonCondition).toBe(100);
  });

  it('clamps an out-of-range wagonCondition on load', () => {
    expect(deserialize({ ...serialize(SNAPSHOT), wagonCondition: 250 })?.wagonCondition).toBe(100);
    expect(deserialize({ ...serialize(SNAPSHOT), wagonCondition: -10 })?.wagonCondition).toBe(0);
  });

  it('reads a missing or malformed courierTile as null (loads at spawn, #315)', () => {
    const legacy = { ...serialize(SNAPSHOT) } as unknown as Record<string, unknown>;
    delete legacy.courierTile;
    expect(deserialize(legacy)?.courierTile).toBeNull();
    expect(deserialize({ ...serialize(SNAPSHOT), courierTile: 'home' })?.courierTile).toBeNull();
    expect(deserialize({ ...serialize(SNAPSHOT), courierTile: { x: 3 } })?.courierTile).toBeNull();
    expect(
      deserialize({ ...serialize(SNAPSHOT), courierTile: { x: Infinity, y: 2 } })?.courierTile,
    ).toBeNull();
  });

  it('floors a fractional courierTile to whole tile coordinates', () => {
    expect(
      deserialize({ ...serialize(SNAPSHOT), courierTile: { x: 7.9, y: 4.2 } })?.courierTile,
    ).toEqual({ x: 7, y: 4 });
  });

  it('rejects a mismatched version', () => {
    expect(deserialize({ ...serialize(SNAPSHOT), version: SAVE_VERSION + 1 })).toBeNull();
  });

  it('rejects non-object input', () => {
    expect(deserialize(null)).toBeNull();
    expect(deserialize('nope')).toBeNull();
    expect(deserialize(42)).toBeNull();
  });

  it('defaults and filters malformed fields defensively', () => {
    const parsed = deserialize({
      version: SAVE_VERSION,
      coins: 'lots',
      reputation: { eastwatch: 2, bad: 'x' },
      unlocks: ['a', 5, null],
      upgrades: 'not-an-array',
      activeContractId: 123,
      contractStatus: 'bogus',
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.coins).toBe(0);
    expect(parsed?.reputation).toEqual({ eastwatch: 2 });
    expect(parsed?.unlocks).toEqual(['a']);
    expect(parsed?.upgrades).toEqual([]);
    expect(parsed?.regionId).toBe('greybridge');
    expect(parsed?.fogByRegion).toEqual({});
    expect(parsed?.fogDimsByRegion).toEqual({});
    expect(parsed?.activeContractId).toBeNull();
    expect(parsed?.contractStatus).toBeNull();
  });

  it('round-trips chosen skill ranks', () => {
    expect(deserialize(serialize(SNAPSHOT))?.skills).toEqual({ 'off-road': 2, wayfinder: 1 });
  });

  it('defaults skills to empty for a save made before skills existed', () => {
    const parsed = deserialize({ version: SAVE_VERSION, coins: 10 });
    expect(parsed?.skills).toEqual({});
  });

  it('drops malformed skill ranks', () => {
    const parsed = deserialize({
      version: SAVE_VERSION,
      coins: 10,
      skills: { 'off-road': 2, bad: 'x', zero: 0, negative: -1, frac: 1.9 },
    });
    expect(parsed?.skills).toEqual({ 'off-road': 2, frac: 1 });
  });

  it('round-trips story flags', () => {
    expect(deserialize(serialize(SNAPSHOT))?.storyFlags).toEqual([
      'greybridge_reveal',
      'met_postmaster',
    ]);
  });

  it('defaults story flags to empty for a save made before dialogue existed', () => {
    const parsed = deserialize({ version: SAVE_VERSION, coins: 10 });
    expect(parsed?.storyFlags).toEqual([]);
  });

  it('drops non-string story flags', () => {
    const parsed = deserialize({
      version: SAVE_VERSION,
      coins: 10,
      storyFlags: ['greybridge_reveal', 7, null, 'met_postmaster'],
    });
    expect(parsed?.storyFlags).toEqual(['greybridge_reveal', 'met_postmaster']);
  });

  it('keeps a valid contract status', () => {
    const parsed = deserialize({ ...serialize(SNAPSHOT), contractStatus: 'accepted' });
    expect(parsed?.contractStatus).toBe('accepted');
  });

  it('migrates a pre-region save (single revealed array) to the greybridge fog', () => {
    const parsed = deserialize({
      version: SAVE_VERSION,
      coins: 10,
      revealed: [3, 4, 5],
    });
    expect(parsed?.regionId).toBe('greybridge');
    expect(parsed?.fogByRegion).toEqual({ greybridge: [3, 4, 5] });
  });

  it('round-trips recorded fog dimensions per region', () => {
    const parsed = deserialize(serialize(SNAPSHOT));
    expect(parsed?.fogDimsByRegion).toEqual({ greybridge: [20, 11], saltreach: [18, 11] });
  });

  it('drops malformed fog dimension entries', () => {
    const parsed = deserialize({
      version: SAVE_VERSION,
      fogDimsByRegion: {
        greybridge: [20, 11],
        bad: [20],
        alsoBad: [20, 'x'],
        notArray: 20,
      },
    });
    expect(parsed?.fogDimsByRegion).toEqual({ greybridge: [20, 11] });
  });

  it('defaults fog dimensions to empty for a save that predates them', () => {
    const parsed = deserialize({
      version: SAVE_VERSION,
      fogByRegion: { greybridge: [3, 4, 5] },
    });
    expect(parsed?.fogByRegion).toEqual({ greybridge: [3, 4, 5] });
    expect(parsed?.fogDimsByRegion).toEqual({});
  });

  it('migrates the legacy global ford unlock id to the greybridge ford', () => {
    expect(migrateUnlocks(['ford-crossing'])).toEqual(['ford-crossing-greybridge']);
    expect(migrateUnlocks(['ford-crossing', 'reinforced-wheels'])).toEqual([
      'ford-crossing-greybridge',
      'reinforced-wheels',
    ]);
  });

  it('dedupes when a save already has both the legacy id and the new id', () => {
    expect(migrateUnlocks(['ford-crossing', 'ford-crossing-greybridge'])).toEqual([
      'ford-crossing-greybridge',
    ]);
  });

  it('passes through unrelated unlock ids unchanged', () => {
    expect(migrateUnlocks(['ford-crossing-saltreach', 'some-other-unlock'])).toEqual([
      'ford-crossing-saltreach',
      'some-other-unlock',
    ]);
  });

  it('deserializes a save with the legacy ford unlock id as an open Greybridge ford', () => {
    const parsed = deserialize({
      version: SAVE_VERSION,
      coins: 10,
      unlocks: ['ford-crossing'],
    });
    expect(parsed?.unlocks).toEqual(['ford-crossing-greybridge']);
  });

  it('rejects a save with no bridgeable version (missing or unknown)', () => {
    // A versionless save has no migration path to the current schema.
    expect(deserialize({ coins: 10 })).toBeNull();
  });
});

describe('migrateSaveData (schema migration ladder)', () => {
  // Synthetic steps let us exercise the ladder independently of the current
  // SAVE_VERSION, so the mechanics are covered before a real bump is ever owed.
  // Step n upgrades a version-n save to version n+1.
  const steps: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
    1: (d) => ({ ...d, addedInV2: true }),
    2: (d) => ({ ...d, renamed: d.legacyName, addedInV3: 3 }),
  };

  it('is a no-op when the save is already at the target version', () => {
    const data = { version: 3, coins: 10 };
    expect(migrateSaveData(data, 3, 3, steps)).toEqual(data);
  });

  it('upgrades an old save through every intermediate step, fields intact', () => {
    const v1 = { version: 1, coins: 10, legacyName: 'keep-me' };
    const migrated = migrateSaveData(v1, 1, 3, steps);
    expect(migrated).toEqual({
      version: 1,
      coins: 10,
      legacyName: 'keep-me',
      addedInV2: true,
      renamed: 'keep-me',
      addedInV3: 3,
    });
  });

  it('refuses to downgrade a save newer than this build', () => {
    expect(migrateSaveData({ version: 4 }, 4, 3, steps)).toBeNull();
  });

  it('refuses to cross a version gap with no registered step', () => {
    // No step keyed at 0, so a version-0 save cannot reach version 1.
    expect(migrateSaveData({ coins: 10 }, 0, 1, steps)).toBeNull();
  });
});
