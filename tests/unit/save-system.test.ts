import { describe, it, expect } from 'vitest';
import {
  serialize,
  deserialize,
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
  achievements: ['first-delivery', 'ford-finder'],
  skills: { 'off-road': 2, wayfinder: 1 },
  storyFlags: ['greybridge_reveal', 'met_postmaster'],
};

describe('save-system', () => {
  it('stamps the current version on serialize', () => {
    expect(serialize(SNAPSHOT).version).toBe(SAVE_VERSION);
  });

  it('round-trips a valid snapshot', () => {
    expect(deserialize(serialize(SNAPSHOT))).toEqual(SNAPSHOT);
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
});
