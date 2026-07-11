// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  writeSave,
  loadSave,
  clearSave,
  hasSeenIntro,
  markIntroSeen,
  SAVE_KEY,
  INTRO_SEEN_KEY,
  type GameSnapshot,
} from '../../src/systems/save-system';

// These cover the localStorage-backed helpers, which the pure serialize/
// deserialize tests cannot reach. Runs under jsdom (see the env directive above)
// so a real localStorage is present.

const SNAPSHOT: GameSnapshot = {
  coins: 120,
  reputation: { eastwatch: 2 },
  unlocks: ['ford-crossing-greybridge'],
  upgrades: ['reinforced-wheels'],
  completed: ['letters-to-eastwatch'],
  visited: ['greywater'],
  regionId: 'greybridge',
  fogByRegion: { greybridge: [0, 1, 2] },
  fogDimsByRegion: { greybridge: [20, 11] },
  activeContractId: null,
  contractStatus: null,
  distanceTiles: 42.5,
  deliveries: 1,
  achievements: ['first-delivery'],
  skills: { 'off-road': 2 },
  storyFlags: ['greybridge_reveal'],
};

describe('save-system storage helpers (jsdom)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('writeSave persists a round-trippable save and reports ok', () => {
    expect(writeSave(SNAPSHOT)).toBe('ok');
    expect(loadSave()).toEqual(SNAPSHOT);
  });

  it('writeSave reports error when the store throws (for example a quota)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(writeSave(SNAPSHOT)).toBe('error');
  });

  it('treats the intro as unseen until marked, then seen', () => {
    expect(hasSeenIntro()).toBe(false);
    markIntroSeen();
    expect(hasSeenIntro()).toBe(true);
  });

  it('keeps the intro-seen flag through a new game (clearSave)', () => {
    writeSave(SNAPSHOT);
    markIntroSeen();
    clearSave();
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBe('1');
    expect(hasSeenIntro()).toBe(true);
  });
});
