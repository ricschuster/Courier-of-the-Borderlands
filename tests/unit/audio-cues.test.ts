import { describe, it, expect } from 'vitest';
import {
  AUDIO_CUES,
  MAX_CUE_GAIN,
  MAX_CUE_MS,
  allCues,
  cueFor,
  type AudioCueId,
} from '../../src/systems/audio-cues';

// These tests pin the promises docs/design/09_audio.md makes about the mix, not
// the exact numbers. A cue can be retuned freely; what cannot change quietly is
// the shape of the mix (the moment that hurt is loudest), the ceilings, or the
// table's completeness.

describe('the cue table', () => {
  it('has an entry for every id, keyed by its own id', () => {
    // A mismatch here would make cueFor return a cue that names a different
    // moment, which is exactly the kind of thing no test would otherwise catch.
    for (const [key, cue] of Object.entries(AUDIO_CUES)) {
      expect(cue.id).toBe(key);
    }
  });

  it('looks up each cue by id', () => {
    const ids: readonly AudioCueId[] = [
      'stranded',
      'repair-refused',
      'route-unlocked',
      'delivered',
      'upgrade-fitted',
      'repaired',
      'level-up',
      'contract-accepted',
    ];
    for (const id of ids) {
      expect(cueFor(id).id).toBe(id);
    }
    expect(allCues()).toHaveLength(ids.length);
  });
});

describe('the mix', () => {
  it('puts the loudest cue on the moment that hurt', () => {
    // The owner's standing direction is that the game should have teeth, and
    // juice.ts already puts its hardest effect on stranding rather than on a
    // delivery. This is the assertion that stops a later tweak from quietly
    // turning this into a rewards-lead mix.
    const stranded = cueFor('stranded');
    const others = allCues().filter((c) => c.id !== 'stranded');
    for (const cue of others) {
      expect(cue.gain, `${cue.id} should not be louder than stranding`).toBeLessThan(
        stranded.gain,
      );
    }
  });

  it('keeps a delivery quieter than either failure', () => {
    // A delivery fires dozens of times a run, so it must sit under the moments
    // that are supposed to sting.
    const delivered = cueFor('delivered');
    expect(delivered.gain).toBeLessThan(cueFor('stranded').gain);
    expect(delivered.gain).toBeLessThan(cueFor('repair-refused').gain);
  });

  it('makes accepting a contract the quietest cue', () => {
    // The most frequent deliberate press in the game.
    const accepted = cueFor('contract-accepted');
    for (const cue of allCues().filter((c) => c.id !== 'contract-accepted')) {
      expect(accepted.gain).toBeLessThanOrEqual(cue.gain);
    }
  });

  it('gives the failures a falling pitch and the good moments a rising one', () => {
    // Direction carries meaning without a word of text, and it is the one part of
    // the mix a player reads without being taught.
    expect(cueFor('stranded').endHz).toBeLessThan(cueFor('stranded').startHz);
    expect(cueFor('repair-refused').endHz).toBeLessThan(cueFor('repair-refused').startHz);
    expect(cueFor('route-unlocked').endHz).toBeGreaterThan(cueFor('route-unlocked').startHz);
    expect(cueFor('delivered').endHz).toBeGreaterThan(cueFor('delivered').startHz);
  });
});

describe('the ceilings', () => {
  it('keeps every cue under the gain ceiling', () => {
    // There is no in-game volume slider, so the only protection against a harsh
    // cue is that none is written.
    for (const cue of allCues()) {
      expect(cue.gain, `${cue.id} exceeds the gain ceiling`).toBeLessThanOrEqual(MAX_CUE_GAIN);
      expect(cue.gain, `${cue.id} is inaudible`).toBeGreaterThan(0);
    }
  });

  it('keeps every cue short', () => {
    // Audio here is punctuation on something already on screen. Anything longer
    // starts to be music, which is out of scope for this slice.
    for (const cue of allCues()) {
      expect(cue.durationMs, `${cue.id} runs too long`).toBeLessThanOrEqual(MAX_CUE_MS);
      expect(cue.durationMs).toBeGreaterThan(0);
    }
  });

  it('gives every cue an attack that fits inside it', () => {
    // A cue whose attack outlasts its duration would never reach its peak, so it
    // would be silently quieter than the table claims.
    for (const cue of allCues()) {
      expect(cue.attackMs, `${cue.id} attack outlasts the cue`).toBeLessThan(cue.durationMs);
      expect(cue.attackMs).toBeGreaterThan(0);
    }
  });

  it('gives the cue that fires without warning the slowest attack of the loud ones', () => {
    // Stranding arrives unannounced, so it must not begin at full amplitude.
    const stranded = cueFor('stranded');
    expect(stranded.attackMs).toBeGreaterThan(cueFor('delivered').attackMs);
    expect(stranded.attackMs).toBeGreaterThan(cueFor('repair-refused').attackMs);
  });
});
