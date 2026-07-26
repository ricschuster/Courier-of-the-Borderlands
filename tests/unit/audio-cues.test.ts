import { describe, it, expect } from 'vitest';
import {
  AUDIO_CUES,
  CUE_TIERS,
  MAX_CUE_GAIN,
  MAX_CUE_MS,
  TIER_GAIN,
  allCues,
  cueFor,
  tierRank,
  type AudioCueId,
} from '../../src/systems/audio-cues';
import { BED_MAX_GAIN } from '../../src/systems/audio-bed';

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
      'gated-ground',
      'ford-crossed',
      'road-joined',
      'road-left',
      'ford-blocked',
      'bump',
      'delivered-bonus',
      'cargo-collected',
      'board-armed',
      'skill-ranked',
      'standing-risen',
      'achievement',
      'settlement-found',
      'discovery',
      'region-travel',
      'region-cleared',
      'encounter-start',
      'encounter-paid',
      'encounter-gained',
      'capstone',
      'dialogue-open',
      'dialogue-advance',
      'dialogue-choice',
    ];
    for (const id of ids) {
      expect(cueFor(id).id).toBe(id);
    }
    expect(allCues()).toHaveLength(ids.length);
  });
});

describe('the tiers', () => {
  // The tier discipline is the whole defence against fatigue as the cue count
  // grows (#383): frequent means quiet, decided once per tier rather than argued
  // per cue. Without these, each new cue would be tuned against the last one
  // written and thirty of them would creep upward together.

  it('keeps every cue inside its tier band', () => {
    for (const cue of allCues()) {
      const [low, high] = TIER_GAIN[cue.tier];
      expect(cue.gain, `${cue.id} is below the ${cue.tier} band`).toBeGreaterThanOrEqual(low);
      expect(cue.gain, `${cue.id} is above the ${cue.tier} band`).toBeLessThanOrEqual(high);
    }
  });

  it('orders the bands so a louder tier is genuinely louder', () => {
    // The bands may touch, but they may not invert: a tick must never be able to
    // outweigh an event. This is what makes the collision rule meaningful, since
    // it picks by tier and only then by gain.
    for (let i = 1; i < CUE_TIERS.length; i += 1) {
      const lower = CUE_TIERS[i - 1];
      const higher = CUE_TIERS[i];
      if (lower === undefined || higher === undefined) {
        continue;
      }
      expect(tierRank(higher)).toBeGreaterThan(tierRank(lower));
      expect(TIER_GAIN[higher][0]).toBeGreaterThanOrEqual(TIER_GAIN[lower][0]);
      expect(TIER_GAIN[higher][1]).toBeGreaterThan(TIER_GAIN[lower][1]);
    }
  });

  it('keeps every tick down at the level of the bed', () => {
    // Ticks are the highest-frequency sound in the game. They are meant to be
    // heard as short pitched transients against the broadband bed, not to out-
    // shout it: a tick louder than the wheels would be the first thing to become
    // fatiguing, and it fires on every panel and every press.
    for (const cue of allCues().filter((c) => c.tier === 'tick')) {
      expect(cue.gain, `${cue.id} pokes through the bed`).toBeLessThanOrEqual(BED_MAX_GAIN);
    }
  });

  it('puts the driving events in the tiers the design note gave them', () => {
    // Crossing onto a road happens constantly; reaching gated ground happens a
    // handful of times a run. They must not be the same weight.
    expect(cueFor('road-joined').tier).toBe('tick');
    expect(cueFor('road-left').tier).toBe('tick');
    expect(cueFor('bump').tier).toBe('tick');
    expect(cueFor('ford-blocked').tier).toBe('tick');
    expect(cueFor('gated-ground').tier).toBe('cue');
    expect(cueFor('ford-crossed').tier).toBe('cue');
  });
});

describe('the mix', () => {
  it('puts the loudest recurring cue on the moment that hurt', () => {
    // The owner's standing direction is that the game should have teeth, and
    // juice.ts already puts its hardest effect on stranding rather than on a
    // delivery. This is the assertion that stops a later tweak from quietly
    // turning this into a rewards-lead mix.
    //
    // The capstone is the one exception, and it is a narrow one: breaking the
    // blockade happens once in a playthrough where stranding happens all run, so
    // the teeth principle (which is about what the player meets repeatedly) is
    // untouched by it. Named here rather than filtered silently, so a second
    // exception has to argue for itself.
    const stranded = cueFor('stranded');
    const others = allCues().filter((c) => c.id !== 'stranded' && c.id !== 'capstone');
    for (const cue of others) {
      expect(cue.gain, `${cue.id} should not be louder than stranding`).toBeLessThan(
        stranded.gain,
      );
    }
    expect(cueFor('capstone').gain).toBeGreaterThan(stranded.gain);
  });

  it('makes the capstone the fullest thing in the mix', () => {
    // The largest beat in the game. It also clears the whole toast queue when it
    // appears, so it must not be able to lose a frame collision to whatever was
    // mid-flight: being the loudest cue in the top tier is what guarantees that.
    const capstone = cueFor('capstone');
    expect(capstone.tier).toBe('moment');
    for (const cue of allCues().filter((c) => c.id !== 'capstone')) {
      expect(cue.gain, `${cue.id} rivals the capstone`).toBeLessThan(capstone.gain);
    }
  });

  it('keeps a delivery quieter than either failure', () => {
    // A delivery fires dozens of times a run, so it must sit under the moments
    // that are supposed to sting.
    const delivered = cueFor('delivered');
    expect(delivered.gain).toBeLessThan(cueFor('stranded').gain);
    expect(delivered.gain).toBeLessThan(cueFor('repair-refused').gain);
  });

  it('makes accepting a contract the quietest thing that is not a tick', () => {
    // The most frequent deliberate press in the game. Ticks are quieter still by
    // construction (#383), so the claim is about the cue tier and above: nothing
    // that marks a decision may sit under the one the player makes most.
    const accepted = cueFor('contract-accepted');
    for (const cue of allCues().filter((c) => c.id !== 'contract-accepted' && c.tier !== 'tick')) {
      expect(accepted.gain, `${cue.id} is quieter than accepting`).toBeLessThanOrEqual(cue.gain);
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
