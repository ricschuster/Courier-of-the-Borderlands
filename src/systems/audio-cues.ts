// The cue table (#226, designed in docs/design/09_audio.md).
//
// Phase 1 of the audio strategy: every cue is synthesized at runtime from these
// numbers, so there are no asset files, no licence entries, and no bundle weight
// yet. This is the audio equivalent of the coloured tiles the map shipped with,
// and it exists so the wiring can be proven before binaries enter the repo.
// Phase 2 swaps in Kenney CC0 samples behind these same ids; call sites do not
// move.
//
// The table is data, not logic, on purpose: every cue's weight is reviewable in
// one place and testable without Phaser or a sound device. The owner's standing
// direction is that the game should have teeth, and the audio mix follows
// juice.ts in putting the heaviest feedback on the moment that hurt rather than
// on a reward. audio-cues.test.ts pins that ("puts the loudest cue on the moment
// that hurt"), so a later tweak cannot quietly turn this into a rewards-lead mix.

/** Every moment that makes a sound. Also the ids the e2e hook reports. */
export type AudioCueId =
  | 'stranded'
  | 'repair-refused'
  | 'route-unlocked'
  | 'delivered'
  | 'upgrade-fitted'
  | 'repaired'
  | 'level-up'
  | 'contract-accepted'
  // Driving events (#383). These sit alongside the continuous bed rather than
  // inside it: the bed says how the ground feels, these mark the moment it
  // changed.
  | 'road-joined'
  | 'road-left'
  | 'gated-ground'
  | 'ford-crossed'
  | 'ford-blocked'
  | 'bump';

/**
 * How often a cue fires, which is the same thing as how loud it may be (#383).
 *
 * Frequent means quiet. This is the whole defence against fatigue as the cue
 * count grows: without it, each new cue is tuned against the last one written
 * rather than against how often the player will hear it, and thirty cues chosen
 * that way creep upward together.
 *
 * The rank order is also the collision order. When several cues are requested in
 * one frame, the highest tier is the one that plays (see audio-mix.ts).
 *
 * The bed is not a tier here. It is a separate continuous voice that is never
 * suppressed and never competes; its band lives in audio-bed.ts.
 */
export type CueTier = 'tick' | 'cue' | 'event' | 'moment';

/** Tiers weakest first. The index in this array is the tier's rank. */
export const CUE_TIERS: readonly CueTier[] = ['tick', 'cue', 'event', 'moment'];

/**
 * The gain band each tier must sit in, inclusive at both ends.
 *
 * Bands touch at 0.18 and 0.24 rather than leaving a gap, so a cue on a boundary
 * is a judgement about how often it fires rather than a number forced up or down
 * to satisfy the table. `delivered` and `upgrade-fitted` both sit at 0.18 and are
 * `cue`, because they fire many times a run.
 */
export const TIER_GAIN: Readonly<Record<CueTier, readonly [number, number]>> = {
  // Every panel, every press. Deliberately inside the bed's own range rather
  // than above it: a tick is heard because it is a short pitched transient
  // against broadband noise, not because it is louder than the wheels. Anything
  // that had to out-shout the bed would be too loud to hear a hundred times.
  tick: [0.04, 0.07],
  // Several times a run.
  cue: [0.1, 0.18],
  // A few times a run.
  event: [0.18, 0.24],
  // Once or twice a run.
  moment: [0.24, 0.32],
};

/** Rank of a tier, higher being louder and more important. For the collision rule. */
export function tierRank(tier: CueTier): number {
  return CUE_TIERS.indexOf(tier);
}

/**
 * One synthesized cue: a tone that slides from `startHz` to `endHz` over
 * `durationMs`, rising to `gain` over `attackMs` and then decaying away.
 *
 * `gain` is peak amplitude (0..1) and doubles as the cue's weight in the mix, so
 * there is one number to compare rather than a label and a level that could
 * disagree. `attackMs` exists for one reason: a cue that fires without warning
 * must not begin at full amplitude, or it startles.
 */
export interface AudioCue {
  readonly id: AudioCueId;
  /** How often this fires, which bounds `gain` and decides frame collisions. */
  readonly tier: CueTier;
  readonly wave: OscillatorType;
  readonly startHz: number;
  readonly endHz: number;
  readonly durationMs: number;
  readonly attackMs: number;
  readonly gain: number;
}

/**
 * No cue may exceed this peak. A ceiling rather than a guideline: these play
 * unprompted over a long session, and there is no in-game volume slider yet, so
 * the only protection against a harsh cue is that none is written.
 */
export const MAX_CUE_GAIN = 0.32;

/**
 * No cue may run longer than this. Audio here is punctuation on a moment that is
 * already on screen; anything longer starts to be music, which is out of scope.
 */
export const MAX_CUE_MS = 400;

/**
 * The cues, heaviest first so the mix reads top to bottom.
 *
 * Every one duplicates something already visible (the design note's table names
 * what, per cue). Nothing here is the only way to learn anything, which is what
 * keeps the game identical to play with the sound off.
 */
export const AUDIO_CUES: Readonly<Record<AudioCueId, AudioCue>> = {
  // The one that hurt. Low and falling, the longest cue, and the loudest, paired
  // with the hard camera shake juice already puts here. Slow attack because a
  // stranding arrives without warning.
  stranded: {
    id: 'stranded',
    tier: 'moment',
    wave: 'sawtooth',
    startHz: 220,
    endHz: 80,
    durationMs: 380,
    attackMs: 40,
    gain: 0.3,
  },
  // The other failure the player has to feel: a repair they cannot pay for. A
  // dull refusal, not a buzzer.
  'repair-refused': {
    id: 'repair-refused',
    tier: 'event',
    wave: 'square',
    startHz: 160,
    endHz: 120,
    durationMs: 220,
    attackMs: 12,
    gain: 0.22,
  },
  // A road opened: the biggest good moment in the game, and the only one juice
  // gives both a shake and a burst. Rises, where the failures fall.
  'route-unlocked': {
    id: 'route-unlocked',
    tier: 'moment',
    wave: 'triangle',
    startHz: 440,
    endHz: 880,
    durationMs: 300,
    attackMs: 10,
    gain: 0.24,
  },
  // Satisfying and quick. Deliberately below the failures: this fires dozens of
  // times a run, and a fanfare each time would wear through.
  delivered: {
    id: 'delivered',
    tier: 'cue',
    wave: 'sine',
    startHz: 660,
    endHz: 990,
    durationMs: 160,
    attackMs: 6,
    gain: 0.18,
  },
  // A part seating into the wagon. Pairs with the existing soft knock.
  'upgrade-fitted': {
    id: 'upgrade-fitted',
    tier: 'cue',
    wave: 'square',
    startHz: 200,
    endHz: 140,
    durationMs: 120,
    attackMs: 6,
    gain: 0.18,
  },
  // Relief, not an event, so it sits under the delivery it pays for.
  repaired: {
    id: 'repaired',
    tier: 'cue',
    wave: 'sine',
    startHz: 520,
    endHz: 620,
    durationMs: 140,
    attackMs: 8,
    gain: 0.12,
  },
  // Fires mid-drive with the player's hands on the keys, so it must not startle:
  // the softest rising cue, with the slowest attack of the quiet ones.
  'level-up': {
    id: 'level-up',
    tier: 'cue',
    wave: 'triangle',
    startHz: 700,
    endHz: 1050,
    durationMs: 200,
    attackMs: 14,
    gain: 0.12,
  },
  // Confirms a commitment. The quietest cue in the table because accepting is the
  // most frequent deliberate press in the game.
  'contract-accepted': {
    id: 'contract-accepted',
    tier: 'cue',
    wave: 'sine',
    startHz: 480,
    endHz: 480,
    durationMs: 90,
    attackMs: 6,
    gain: 0.1,
  },
  // Wet, heavy ground the base wagon could not cross at all until a capability
  // opened it (deep mire, tidal flats). Low and falling: this is a shortcut that
  // costs, not a reward.
  'gated-ground': {
    id: 'gated-ground',
    tier: 'cue',
    wave: 'triangle',
    startHz: 300,
    endHz: 200,
    durationMs: 220,
    attackMs: 12,
    gain: 0.14,
  },
  // Water under the wheels. Rises, because taking the ford is the shortcut
  // working.
  'ford-crossed': {
    id: 'ford-crossed',
    tier: 'cue',
    wave: 'sine',
    startHz: 400,
    endHz: 560,
    durationMs: 180,
    attackMs: 10,
    gain: 0.12,
  },
  // Joining a road. The pillar says roads are gameplay, and this is the moment
  // the ground under the wagon becomes the good kind.
  'road-joined': {
    id: 'road-joined',
    tier: 'tick',
    wave: 'sine',
    startHz: 700,
    endHz: 900,
    durationMs: 70,
    attackMs: 5,
    gain: 0.06,
  },
  // Leaving one. The same tick inverted, so the pair reads as a direction rather
  // than as two unrelated sounds.
  'road-left': {
    id: 'road-left',
    tier: 'tick',
    wave: 'sine',
    startHz: 900,
    endHz: 700,
    durationMs: 70,
    attackMs: 5,
    gain: 0.06,
  },
  // A ford that is still locked, alongside the toast that already explains it.
  'ford-blocked': {
    id: 'ford-blocked',
    tier: 'tick',
    wave: 'square',
    startHz: 200,
    endHz: 170,
    durationMs: 90,
    attackMs: 5,
    gain: 0.07,
  },
  // Driving into water or a mountain. Silent today, which reads as the game
  // having frozen rather than as an edge. A dull knock, nothing more: the player
  // is usually holding the key down, so this can repeat.
  bump: {
    id: 'bump',
    tier: 'tick',
    wave: 'square',
    startHz: 140,
    endHz: 100,
    durationMs: 70,
    attackMs: 4,
    gain: 0.07,
  },
};

/** Every cue, for tests and for any consumer that wants to walk the table. */
export function allCues(): readonly AudioCue[] {
  return Object.values(AUDIO_CUES);
}

/** Look up a cue by id. */
export function cueFor(id: AudioCueId): AudioCue {
  return AUDIO_CUES[id];
}
