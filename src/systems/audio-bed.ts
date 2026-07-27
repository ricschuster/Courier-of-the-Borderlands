// The rolling bed (#383, designed in docs/design/09_audio.md).
//
// Every cue shipped in #382 is a one-shot. Wheels rolling is a continuous voice,
// so it is a subsystem rather than another row in audio-cues.ts: it has no start
// and no end, only a shape that changes every frame.
//
// This module is the pure half. It answers one question, with no WebAudio in
// sight: given how fast the wagon is actually moving, what it is moving over,
// what state it is in and what the weather is doing, what should the bed sound
// like right now? The scene half (scenes/audio-bed-voice.ts) turns that answer
// into filtered noise.
//
// Why terrain drives the timbre: "roads are gameplay" is design pillar 3, and
// today leaving the road is only a number on a meter. A bed that thins out on a
// road and turns wet and heavy in the mire makes the pillar audible, which is
// something no meter does.
//
// The one rule from the design note still holds. The bed carries no information
// that is not already on screen: the terrain readout names the ground, the wagon
// meter shows the condition, and the weather label sits in the status line.

/** What the scene knows about the wagon this frame. */
export interface BedInput {
  /** Actual velocity magnitude in px/s, not input. Terrain, upgrades, weather and
   * limping are all already folded into it, which is exactly why it is the input:
   * the bed then reflects them for free rather than re-deriving any of them. */
  readonly speed: number;
  /** Speed the bed treats as "full pelt". Above it the bed does not get louder. */
  readonly referenceSpeed: number;
  /** Terrain id under the wagon, or undefined off the map. */
  readonly terrainId: string | undefined;
  /** Wagon condition as a fraction of its current maximum, 0..1. */
  readonly conditionFraction: number;
  /** Weather id for the run. */
  readonly weatherId: string;
}

/** What the bed should sound like this frame. */
export interface BedProfile {
  /** Peak amplitude, 0 when stopped. Never above BED_MAX_GAIN. */
  readonly gain: number;
  /** Bandpass centre in Hz. Low is heavy and wet, high is thin and smooth. */
  readonly centerHz: number;
  /** Bandpass Q. High is a narrow, hard surface; low is broad and soft. */
  readonly q: number;
  /** Depth of the limp knock, 0..1. Zero on a healthy wagon. */
  readonly knock: number;
  /** Which terrain profile was used. Named so the e2e can see the ground change. */
  readonly surface: BedSurface;
}

/**
 * The bed's ceiling. Well below the quietest cue (`contract-accepted`, 0.10) and
 * below the tick band's floor too, because this plays continuously and everything
 * else has to be audible over it.
 */
export const BED_MAX_GAIN = 0.08;

/**
 * The floor while actually rolling. A bed that faded to nothing at a crawl would
 * make limping silent, which is the opposite of what a limp should feel like.
 */
export const BED_MIN_GAIN = 0.02;

/**
 * What the caller should multiply base courier speed by to get `referenceSpeed`.
 *
 * Above 1 on purpose. A road is 1.2x before any upgrade, and skills and fair
 * winds stack on top, so a reference of exactly base speed would peg the bed at
 * its ceiling for most of a run and speed would stop being audible at all. This
 * leaves headroom so the fast end still sounds fast.
 */
export const BED_REFERENCE_MULTIPLIER = 1.5;

/** Named surfaces, coarser than terrain ids: several terrains share a sound. */
export type BedSurface = 'paved' | 'open' | 'rough' | 'wet' | 'unknown';

interface SurfaceVoice {
  readonly centerHz: number;
  readonly q: number;
  /** Multiplies the speed-derived gain. Rough ground is simply louder. */
  readonly loudness: number;
}

/**
 * Four voices, not eleven. Terrain ids exist to be balanced against each other;
 * the ear only needs to hear which kind of ground this is, and a distinct sound
 * per terrain would be a memory test the design note's one rule forbids anyway.
 */
export const BED_SURFACES: Readonly<Record<BedSurface, SurfaceVoice>> = {
  // Road and bridge: thin and smooth, and the quietest surface. The reward for
  // being on the road is that the wagon stops complaining.
  paved: { centerHz: 1400, q: 3, loudness: 0.75 },
  // Plains and hills: the default, unremarkable by design.
  open: { centerHz: 900, q: 1.4, loudness: 1 },
  // Forest and trail: coarser, more broadband.
  rough: { centerHz: 640, q: 1, loudness: 1.1 },
  // Marsh, deep mire, tidal flats, fords. Low and broad: water and soft mud.
  wet: { centerHz: 340, q: 0.8, loudness: 1.2 },
  // Off the map, or a terrain id this table has not met. Sounds like `open`
  // rather than falling silent, because silence would read as a bug.
  unknown: { centerHz: 900, q: 1.4, loudness: 1 },
};

/** Terrain id to surface. Anything unlisted is `unknown`. */
const SURFACE_BY_TERRAIN: Readonly<Record<string, BedSurface>> = {
  road: 'paved',
  bridge: 'paved',
  plains: 'open',
  hills: 'open',
  forest: 'rough',
  trail: 'rough',
  marsh: 'wet',
  'deep-mire': 'wet',
  'tidal-flat': 'wet',
  'ford-greybridge': 'wet',
  'ford-saltreach': 'wet',
  'ford-fenmarch': 'wet',
  'ford-ashmoor': 'wet',
};

/** The surface a terrain id rolls like. */
export function surfaceFor(terrainId: string | undefined): BedSurface {
  if (terrainId === undefined) {
    return 'unknown';
  }
  return SURFACE_BY_TERRAIN[terrainId] ?? 'unknown';
}

interface WeatherVoice {
  /** Multiplies the bandpass centre. Below 1 thickens, above 1 thins. */
  readonly centerScale: number;
  /** Multiplies the gain. */
  readonly loudness: number;
}

/**
 * Weather as a filter on a bed that already exists, which is the cheapest
 * possible answer to a standing complaint: a 2026-07-12 playtester suspected
 * weather did nothing, because only its name was shown
 * (docs/design/08_ui_and_onboarding.md). It now changes how the road sounds.
 */
const WEATHER_VOICES: Readonly<Record<string, WeatherVoice>> = {
  clear: { centerScale: 1, loudness: 1 },
  // A tailwind: lighter under the wheels.
  'fair-winds': { centerScale: 1.15, loudness: 0.95 },
  // Fog muffles. Quieter and duller, without being slower (mist costs sight, not
  // speed, and the bed must not claim otherwise).
  mist: { centerScale: 0.85, loudness: 0.9 },
  // Heavy, clinging. The thickest the bed gets.
  mud: { centerScale: 0.7, loudness: 1.1 },
};

const DEFAULT_WEATHER_VOICE: WeatherVoice = { centerScale: 1, loudness: 1 };

/**
 * Condition at or below this fraction starts the limp knock, matching
 * LOW_CONDITION_FRACTION in wagon-condition.ts: the band the HUD meter already
 * turns amber in, so the wagon starts sounding hurt exactly when it starts
 * looking hurt.
 */
export const BED_KNOCK_FRACTION = 0.3;

/** Clamp to a range. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * The bed for this frame.
 *
 * Gain is the only thing speed touches, and it is zero at a standstill: a parked
 * wagon makes no rolling sound. Everything else describes the ground and the
 * wagon, so it stays meaningful even while stopped, which is what lets the voice
 * fade out over a surface rather than cutting.
 */
export function bedProfileFor(input: BedInput): BedProfile {
  const surface = surfaceFor(input.terrainId);
  const voice = BED_SURFACES[surface];
  const weather = WEATHER_VOICES[input.weatherId] ?? DEFAULT_WEATHER_VOICE;

  const reference = input.referenceSpeed > 0 ? input.referenceSpeed : 1;
  const fraction = clamp(input.speed / reference, 0, 1);
  // Below this the wagon is not really rolling: residual velocity, a collision
  // slide, or a single frame of drift. Treated as stopped so the bed does not
  // hum while parked against a wall.
  const rolling = fraction > 0.02;
  const raw = rolling ? BED_MIN_GAIN + (BED_MAX_GAIN - BED_MIN_GAIN) * fraction : 0;
  const gain = clamp(raw * voice.loudness * weather.loudness, 0, BED_MAX_GAIN);

  const health = clamp(input.conditionFraction, 0, 1);
  // Ramps in across the low band rather than switching on at the threshold, so a
  // wagon that is nearly stranded knocks harder than one that just dipped.
  const knock = health >= BED_KNOCK_FRACTION ? 0 : 1 - health / BED_KNOCK_FRACTION;

  return {
    gain,
    centerHz: voice.centerHz * weather.centerScale,
    q: voice.q,
    knock: clamp(knock, 0, 1),
    surface,
  };
}
