// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AUDIO_MUTED_KEY,
  loadAudioMuted,
  saveAudioMuted,
} from '../../src/systems/audio-preference';
import { clearSave } from '../../src/systems/save-system';

// Runs under jsdom so a real localStorage is present, matching save-storage.test.ts.

describe('the mute preference (jsdom)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('reads as unmuted until the player mutes', () => {
    // Decision 2 in the design note: SFX default on.
    expect(loadAudioMuted()).toBe(false);
  });

  it('round-trips the preference', () => {
    saveAudioMuted(true);
    expect(loadAudioMuted()).toBe(true);
    saveAudioMuted(false);
    expect(loadAudioMuted()).toBe(false);
  });

  it('removes the key when unmuting rather than storing a falsey value', () => {
    // "No key" and "unmuted" are deliberately one state, so a stale value cannot
    // outlive a change in how the flag is encoded.
    saveAudioMuted(true);
    expect(localStorage.getItem(AUDIO_MUTED_KEY)).not.toBeNull();
    saveAudioMuted(false);
    expect(localStorage.getItem(AUDIO_MUTED_KEY)).toBeNull();
  });

  it('treats an unrecognized stored value as unmuted', () => {
    localStorage.setItem(AUDIO_MUTED_KEY, 'yes');
    expect(loadAudioMuted()).toBe(false);
  });

  it('survives a new game, because muting is a preference and not run state', () => {
    // The same reasoning as DIFFICULTY_KEY: this is about the room the player is
    // sitting in, so clearSave must not touch it. A New Game that un-mutes the
    // game would be startling in exactly the situation a muted player chose to
    // avoid.
    saveAudioMuted(true);
    clearSave();
    expect(loadAudioMuted()).toBe(true);
  });

  it('reads as unmuted when the store cannot be read', () => {
    // The honest default, matching prefersReducedMotion: never claim a preference
    // the player did not express. Silencing someone who never asked for silence is
    // the worse failure, because silence gives them nothing to react to.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(loadAudioMuted()).toBe(false);
  });

  it('does not throw when the store cannot be written', () => {
    // Best effort: the live state is held by the caller, so a write failure costs
    // the setting on the next visit, not this session.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => saveAudioMuted(true)).not.toThrow();
  });

  it('does not throw when the store cannot be cleared', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(() => saveAudioMuted(false)).not.toThrow();
  });
});
