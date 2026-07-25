import type { BedProfile } from '../systems/audio-bed';

// The audible half of the rolling bed (#383). The decisions live in
// systems/audio-bed.ts; this only builds nodes and moves parameters.
//
// Filtered noise, not an oscillator. Wheels on ground are broadband, and a tone
// would read as a hum or an alarm rather than as a surface. The graph is:
//
//   noise (looping buffer) -> bandpass -> knock gain -> output gain -> master
//                                            ^
//                                     knock LFO -> depth
//
// Built once and then only modulated, because a continuous voice that rebuilt its
// nodes per frame would click on every change and leak sources.
//
// Everything here is ramped, never set. A jump in gain or filter frequency is an
// audible click, and terrain changes every few frames while driving diagonally
// along a road edge.

/**
 * The subset of AudioContext the bed needs, mirroring CueContext in audio.ts and
 * for the same reason: `createBedVoice` is wrapped in a catch upstream, so a
 * broken graph would be silently silent with every other test still green. That
 * is trap 1's second shape, so the node graph is asserted directly against a
 * recording double.
 */
export interface BedContext {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: AudioNode;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
  createBufferSource(): AudioBufferSourceNode;
  createBiquadFilter(): BiquadFilterNode;
  createGain(): GainNode;
  createOscillator(): OscillatorNode;
}

/**
 * A built bed, driven one frame at a time.
 *
 * There is no stop(). The voice lives as long as the document, alongside the
 * AudioContext and for the same reason, and a scene teardown silences it by
 * updating to a zero-gain profile rather than tearing the graph down. That also
 * means the settle applies on the way out: travelling through a gateway lets the
 * wheels trail off across the scene rebuild instead of cutting.
 */
export interface BedVoice {
  /** Move the voice toward `profile`. Cheap; called every frame. */
  update(profile: BedProfile): void;
}

/**
 * Seconds of noise in the loop buffer. Long enough that the loop seam is not a
 * pitch the ear can latch onto, short enough to be a trivial allocation.
 */
const NOISE_SECONDS = 2;

/**
 * How quickly the bed follows a change, as a setTargetAtTime time constant.
 *
 * Asymmetric on purpose. Speeding up should feel immediate, but stopping should
 * *settle*: the wheels trail off rather than being cut, which is what makes
 * coming to rest an event rather than an absence. The design note asked for a
 * transition on stopping, and this is it, in one number rather than a scheduled
 * one-shot that would fight the bed it was decorating.
 */
const RISE_SECONDS = 0.05;
const SETTLE_SECONDS = 0.22;

/** Filter and knock changes always use this: neither is a "stop". */
const TIMBRE_SECONDS = 0.12;

/** The limp knock: a slow, heavy roll rather than a rattle. */
const KNOCK_HZ = 3.2;

/**
 * How much of the bed the knock can swallow at full depth. Not 1: the bed must
 * not chop to silence between knocks, or a badly hurt wagon would sound broken
 * rather than hurt.
 */
const MAX_KNOCK_DEPTH = 0.55;

/**
 * Fill a buffer with white noise. Deterministic on purpose (a plain LCG, no
 * Math.random): the game seeds every other random source, and a reproducible
 * buffer means a rendered measurement of the bed is reproducible too.
 */
function fillNoise(buffer: AudioBuffer): void {
  const data = buffer.getChannelData(0);
  let seed = 0x2f6e2b1;
  for (let i = 0; i < data.length; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (seed / 0x3fffffff) - 1;
  }
}

/**
 * Build the bed. Throws nothing of its own; the caller owns the catch, exactly
 * as `synthesizeCue` does.
 */
export function createBedVoice(ctx: BedContext, output: AudioNode): BedVoice {
  const now = ctx.currentTime;

  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
  fillNoise(buffer);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(900, now);
  filter.Q.setValueAtTime(1.4, now);

  // The knock is amplitude modulation: an LFO into a gain that sits at 1 and is
  // pulled down by `depth`. At depth 0 the LFO contributes nothing and the node
  // is a plain pass-through, so a healthy wagon costs one multiply.
  const knockGain = ctx.createGain();
  knockGain.gain.setValueAtTime(1, now);
  const knockLfo = ctx.createOscillator();
  knockLfo.type = 'sine';
  knockLfo.frequency.setValueAtTime(KNOCK_HZ, now);
  const knockDepth = ctx.createGain();
  knockDepth.gain.setValueAtTime(0, now);
  knockLfo.connect(knockDepth);
  knockDepth.connect(knockGain.gain);

  // Starts silent. The bed is built at scene create(), long before the wagon
  // moves, and a bed that began audible would be the loudest thing on the title
  // handoff frame.
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);

  source.connect(filter);
  filter.connect(knockGain);
  knockGain.connect(gain);
  gain.connect(output);
  source.start(now);
  knockLfo.start(now);

  let lastGain = 0;

  return {
    update(profile: BedProfile): void {
      const at = ctx.currentTime;
      // Rising is quick, falling settles. Compared against the last commanded
      // value rather than reading the param back, so this holds even in a
      // context whose value getters are not implemented.
      const constant = profile.gain >= lastGain ? RISE_SECONDS : SETTLE_SECONDS;
      gain.gain.setTargetAtTime(profile.gain, at, constant);
      lastGain = profile.gain;
      filter.frequency.setTargetAtTime(profile.centerHz, at, TIMBRE_SECONDS);
      filter.Q.setTargetAtTime(profile.q, at, TIMBRE_SECONDS);
      knockDepth.gain.setTargetAtTime(profile.knock * MAX_KNOCK_DEPTH, at, TIMBRE_SECONDS);
    },
  };
}
