// The player's mute preference (#226, designed in docs/design/09_audio.md).
//
// Why this exists at all, when `reduced-motion.ts` needed nothing of the kind:
// juice reads `prefers-reduced-motion` from the OS, because the player has
// usually already told their system. There is no equivalent media query for
// audio, so the answer has to be asked for and remembered here.
//
// Kept out of the save deliberately, following DIFFICULTY_KEY and INTRO_SEEN_KEY
// in save-system.ts: muting is a preference about the room the player is sitting
// in, not state belonging to a run, so it must survive a New Game.

import { namespacedKey } from './storage-namespace';

/**
 * Mute preference key. Namespaced (ADR 0008) because localStorage is scoped to an
 * origin and not a path, so a PR preview must not write the player's real
 * settings. This key is new, so it has no production history to preserve.
 */
export const AUDIO_MUTED_KEY = namespacedKey('courier-of-the-borderlands/audio-muted');

/** Stored when muted. Any other value, or no value, reads as unmuted. */
const MUTED_VALUE = '1';

/**
 * localStorage, or null when it cannot be reached at all (private mode, storage
 * disabled, a sandboxed iframe). Access itself can throw, not just the calls, so
 * the whole thing is guarded.
 */
function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Whether the player has muted the game.
 *
 * A storage failure reads as **unmuted**, matching `prefersReducedMotion`'s
 * reasoning: answer with the honest default rather than claiming a preference the
 * player never expressed. Silencing a player who never asked for silence is the
 * worse of the two failures, because sound is the thing they can immediately
 * turn off and silence gives them nothing to react to.
 */
export function loadAudioMuted(): boolean {
  const store = storage();
  if (store === null) {
    return false;
  }
  try {
    return store.getItem(AUDIO_MUTED_KEY) === MUTED_VALUE;
  } catch {
    return false;
  }
}

/**
 * Remember the mute preference. Best effort: a write failure costs the player the
 * setting on their next visit, not this session, because the live state is held
 * by the caller either way.
 */
export function saveAudioMuted(muted: boolean): void {
  const store = storage();
  if (store === null) {
    return;
  }
  try {
    if (muted) {
      store.setItem(AUDIO_MUTED_KEY, MUTED_VALUE);
    } else {
      // Removed rather than set to '0', so "no key" and "unmuted" are one state
      // and a stale value cannot outlive a change in encoding.
      store.removeItem(AUDIO_MUTED_KEY);
    }
  } catch {
    // Ignore: worst case the preference does not survive the visit.
  }
}
