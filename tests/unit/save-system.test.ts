import { describe, it, expect } from 'vitest';
import {
  serialize,
  deserialize,
  SAVE_VERSION,
  type GameSnapshot,
} from '../../src/systems/save-system';

const SNAPSHOT: GameSnapshot = {
  coins: 120,
  reputation: { eastwatch: 2, southmill: 3 },
  unlocks: ['ford-crossing'],
  upgrades: ['reinforced-wheels'],
  completed: ['letters-to-eastwatch'],
  visited: ['greywater', 'eastwatch'],
  fogWidth: 20,
  fogHeight: 11,
  revealed: [0, 1, 2, 21, 22],
  activeContractId: 'grain-to-southmill',
  contractStatus: 'carrying',
  distanceTiles: 42.5,
  deliveries: 1,
  achievements: ['first-delivery', 'ford-finder'],
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
      revealed: [1, 'two', 3],
      activeContractId: 123,
      contractStatus: 'bogus',
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.coins).toBe(0);
    expect(parsed?.reputation).toEqual({ eastwatch: 2 });
    expect(parsed?.unlocks).toEqual(['a']);
    expect(parsed?.upgrades).toEqual([]);
    expect(parsed?.revealed).toEqual([1, 3]);
    expect(parsed?.activeContractId).toBeNull();
    expect(parsed?.contractStatus).toBeNull();
  });

  it('keeps a valid contract status', () => {
    const parsed = deserialize({ ...serialize(SNAPSHOT), contractStatus: 'accepted' });
    expect(parsed?.contractStatus).toBe('accepted');
  });
});
