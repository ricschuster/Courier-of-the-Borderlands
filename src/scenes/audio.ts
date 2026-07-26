import { cueFor, type AudioCue, type AudioCueId } from '../systems/audio-cues';
import { loadAudioMuted, saveAudioMuted } from '../systems/audio-preference';
import { chooseCue, MASTER_GAIN } from '../systems/audio-mix';
import { bedProfileFor, type BedInput, type BedProfile } from '../systems/audio-bed';
import { createBedVoice, type BedContext, type BedVoice } from './audio-bed-voice';

// Sound effects (#226, designed in docs/design/09_audio.md). The sibling of
// juice.ts, and it holds to the same promise that file states:
//
//   Removing the whole file would leave the game fully playable and identical to
//   play.
//
// No information reaches the player through sound alone. Every cue duplicates
// something already on screen, which is why each call site below sits beside the
// toast or panel that already said it. That is the accessibility requirement, and
// it is met by what the cues are, not by a setting.
//
// Phase 1 synthesizes each cue from the numbers in audio-cues.ts, so there are no
// asset files yet. Raw WebAudio rather than Phaser's loader because there is
// nothing to load: an oscillator and a gain envelope is the whole implementation,
// and it keeps binaries out of the repo until the wiring is proven.
//
// Two things make a cue silent, and they are not the same thing:
//
//   muted   the player pressed V. Nothing is requested and nothing plays.
//   no output   there is no AudioContext to play through: the browser has no
//               WebAudio, construction threw, or this is an e2e run. Cues are
//               still *requested*, so the wiring stays observable.
//
// The split matters because of trap 1. Under ?e2e the game runs with Phaser's
// noAudio manager and no context here, so nothing can be heard, and a call site
// that never fires would look identical to one that does. Juice hit the same
// problem and solved it by exposing isEnabled() for the hook, noting that "an
// accessibility promise that is only asserted in a unit test is a promise about a
// function, not about the game". So this records the last cue it was asked for,
// and the e2e asserts a delivery asked for one and that muting stops it.
//
// #383 added two things on top of that:
//
//   - A continuous rolling bed under everything. It is a voice, not a cue, so it
//     goes through its own path and is never suppressed by a collision.
//   - One cue voice per frame. Requests accumulate through the frame and the
//     highest tier plays at the start of the next one (see audio-mix.ts). The
//     one-frame delay is inaudible, and flushing at the top of update() is the
//     only place that provably covers every one of update()'s early returns.

/** The audible part, separated so the class is testable without WebAudio. */
export interface AudioOutput {
  play(cue: AudioCue): void;
  bed(profile: BedProfile): void;
  resume(): void;
}

/**
 * The subset of AudioContext the synthesis uses. Named so `synthesizeCue` can be
 * driven by a recording double in tests: the node-building below is wrapped in a
 * catch (a cue must never break a frame), which means a broken sequence would be
 * *silently* silent and every other test would still pass. That is trap 1's
 * second shape, a path whose broken and correct behaviour look identical, so the
 * sequence is asserted directly rather than assumed.
 */
export interface CueContext {
  readonly currentTime: number;
  readonly destination: AudioNode;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
}

/**
 * Schedule one cue: an oscillator sliding startHz to endHz, through a gain that
 * ramps up over the attack and then decays away. Nodes stop themselves, which is
 * what WebAudio expects for one-shots.
 *
 * `output` is the master gain rather than the context destination (#383), so one
 * node carries the bed and every cue and a future volume slider has somewhere to
 * live. Defaults to the destination so the tests that predate the master gain
 * still describe a complete graph.
 *
 * Exported for the tests described on CueContext. Throws nothing on its own; the
 * caller owns the catch.
 */
export function synthesizeCue(ctx: CueContext, cue: AudioCue, output?: AudioNode): void {
  const now = ctx.currentTime;
  const end = now + cue.durationMs / 1000;
  const osc = ctx.createOscillator();
  osc.type = cue.wave;
  osc.frequency.setValueAtTime(cue.startHz, now);
  if (cue.endHz !== cue.startHz) {
    // Exponential, so a slide reads as musical rather than as a ramp. Safe for
    // every cue because no frequency in the table is zero.
    osc.frequency.exponentialRampToValueAtTime(cue.endHz, end);
  }
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(cue.gain, now + cue.attackMs / 1000);
  // To a floor rather than to 0: an exponential ramp cannot reach zero, and a hard
  // cut would click.
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain);
  gain.connect(output ?? ctx.destination);
  osc.start(now);
  osc.stop(end);
}

/**
 * The cues that have actually played, most recent last, capped at the last
 * handful. Module-level rather than per-Audio, and that is the whole point:
 * `lastPlayedCue()` lives on an instance, and the instance is replaced when the
 * scene restarts.
 *
 * Region travel is exactly that case (#384). Its cue is requested and flushed on
 * the frame that calls `scene.restart`, so by the time a spec can read anything,
 * the Audio that played it is gone and its record with it. Without a document-
 * lifetime log, the one call site whose timing is genuinely unusual would be the
 * one call site no browser test could see, which is trap 1 pointed at the
 * riskiest line in the change.
 */
const PLAYED_LOG_LIMIT = 24;
let playedLog: AudioCueId[] = [];
let requestedLog: AudioCueId[] = [];

/** The recent played cues, for the e2e hook. Survives a scene restart. */
export function playedCueLog(): readonly AudioCueId[] {
  return playedLog;
}

/**
 * The recent *requested* cues, which is deliberately not the same list.
 *
 * "Did this call site fire" and "what did the player hear" became different
 * questions the moment cues started sharing frames (#384): the first delivery of
 * a run requests the delivery cue and is heard as the achievement it earned, and
 * arriving somewhere new to collect cargo requests both and is heard as the
 * arrival. A spec proving a call site exists has to ask the first question, and
 * only this log answers it.
 */
export function requestedCueLog(): readonly AudioCueId[] {
  return requestedLog;
}

/** Append to a capped log, newest last. */
function record(log: AudioCueId[], id: AudioCueId): AudioCueId[] {
  log.push(id);
  return log.length > PLAYED_LOG_LIMIT ? log.slice(-PLAYED_LOG_LIMIT) : log;
}

/** A bed profile that makes no sound, used while muted and on scene teardown. */
const SILENT_BED: BedProfile = {
  gain: 0,
  centerHz: 900,
  q: 1.4,
  knock: 0,
  surface: 'unknown',
};

/**
 * Scene-lifetime sound. Construct one per create(); it holds no global state
 * beyond the shared output, which browsers cap per document, so that is created
 * lazily and reused across scene restarts via a module-level handle.
 */
export class Audio {
  private muted: boolean;
  private readonly output: AudioOutput | null;
  private lastCue: AudioCueId | null = null;
  private lastPlayed: AudioCueId | null = null;
  /** Cues asked for since the last flush. Emptied every frame. */
  private pending: AudioCueId[] = [];
  /** The profile currently commanded, so the e2e can see the bed without hearing it. */
  private bedProfile: BedProfile = SILENT_BED;
  /** The last input the scene gave the bed, so it can be settled without one. */
  private bedInput: BedInput | null = null;

  /**
   * @param silent true to build with no output at all (the e2e runs). Cues are
   *   still recorded, so specs can prove the call sites fire.
   */
  constructor(silent: boolean) {
    this.muted = loadAudioMuted();
    this.output = silent ? null : sharedOutput();
  }

  /** The player's mute state, for the HUD hint and the e2e hook. */
  isMuted(): boolean {
    return this.muted;
  }

  /**
   * Flip the mute preference and persist it. Returns the new state so the caller
   * can report it without asking again.
   */
  toggleMuted(): boolean {
    this.muted = !this.muted;
    saveAudioMuted(this.muted);
    if (this.muted) {
      // The bed is a voice rather than a request, so muting has to reach in and
      // silence it. A cue path that merely stops requesting would leave the
      // wheels rolling, which is the loudest possible way to fail to mute.
      this.pending = [];
      this.applyBed(SILENT_BED);
    }
    return this.muted;
  }

  /**
   * The cue most recently requested, or null if none has been since the last
   * reset. Exposed for the e2e hook only: with no sound device in CI this is the
   * only evidence that a call site fired at all.
   *
   * This is what was *asked for*, which is deliberately not the same as what was
   * heard: a request that lost a frame collision still shows up here, because the
   * question this answers is whether the call site exists.
   */
  lastRequestedCue(): AudioCueId | null {
    return this.lastCue;
  }

  /**
   * The cue that actually won its frame and played, which is what the collision
   * rule can be proven by. Null until a frame with at least one request flushes.
   */
  lastPlayedCue(): AudioCueId | null {
    return this.lastPlayed;
  }

  /**
   * Clear every record, so a spec can assert that the next action requested
   * nothing. That includes the document-level played log, which is what makes
   * "these cues, and only these, since I cleared" an assertable statement.
   */
  clearLastRequestedCue(): void {
    this.lastCue = null;
    this.lastPlayed = null;
    playedLog = [];
    requestedLog = [];
  }

  /**
   * Play the winner of the frame just ended and start collecting the next one.
   * Called once at the top of update(), which is the only point that runs on
   * every path through the frame including the modal early returns.
   */
  flushFrame(): void {
    if (this.pending.length === 0) {
      return;
    }
    const winner = chooseCue(this.pending);
    this.pending = [];
    if (winner === null) {
      return;
    }
    this.lastPlayed = winner;
    playedLog = record(playedLog, winner);
    this.output?.play(cueFor(winner));
  }

  /**
   * Update the rolling bed for this frame. Cheap and expected every frame; the
   * profile is pure (systems/audio-bed.ts) and the voice only ramps toward it.
   */
  updateBed(input: BedInput): void {
    this.bedInput = input;
    this.applyBed(this.muted ? SILENT_BED : bedProfileFor(input));
  }

  /**
   * Bring the bed to rest without a fresh input: the wagon is frozen behind a
   * panel or a conversation, or the scene is shutting down. The surface and
   * weather are kept, so it settles over the ground it stopped on.
   */
  settleBed(): void {
    if (this.bedInput === null) {
      this.applyBed(SILENT_BED);
      return;
    }
    this.updateBed({ ...this.bedInput, speed: 0 });
  }

  /** What the bed is currently doing. For the e2e hook: a voice has no "last cue". */
  bedState(): BedProfile {
    return this.bedProfile;
  }

  /**
   * Let the browser start audio. Autoplay policy blocks sound until a user
   * gesture, and a player with a save boots straight into the map with no title
   * click, so there may be no gesture until the first drive key. Cheap and
   * idempotent, so the scene can call it on input without tracking whether it has.
   */
  unlock(): void {
    this.output?.resume();
  }

  /** The wagon broke down. The loudest cue: this is the moment that hurt. */
  stranded(): void {
    this.play('stranded');
  }

  /** A repair the player could not pay for. The other failure worth feeling. */
  repairRefused(): void {
    this.play('repair-refused');
  }

  /** A road opened. The biggest good moment in the game. */
  routeUnlocked(): void {
    this.play('route-unlocked');
  }

  /** A delivery landed. Short: this happens dozens of times a run. */
  delivered(): void {
    this.play('delivered');
  }

  /** An upgrade was fitted. */
  upgradeFitted(): void {
    this.play('upgrade-fitted');
  }

  /** Patched up. Relief, not an event. */
  repaired(): void {
    this.play('repaired');
  }

  /** A level, and the skill point it carries. Fires mid-drive, so it stays soft. */
  levelUp(): void {
    this.play('level-up');
  }

  /** A contract was committed to. The quietest cue that is not a tick. */
  contractAccepted(): void {
    this.play('contract-accepted');
  }

  /** The wheels found a road. The pillar, made audible. */
  roadJoined(): void {
    this.play('road-joined');
  }

  /** And lost it again. */
  roadLeft(): void {
    this.play('road-left');
  }

  /** Onto ground the base wagon could not have crossed: deep mire, tidal flats. */
  gatedGround(): void {
    this.play('gated-ground');
  }

  /** Water under the wheels at a ford. */
  fordCrossed(): void {
    this.play('ford-crossed');
  }

  /** A ford that has not been opened yet, beside the toast that explains it. */
  fordBlocked(): void {
    this.play('ford-blocked');
  }

  /** Driving into water or a mountain, which is otherwise silent and reads as a freeze. */
  bumped(): void {
    this.play('bump');
  }

  /**
   * A delivery that also met its bonus objective. One cue rather than a flourish
   * layered over `delivered()`: two voices in a frame is exactly the mud the
   * collision rule exists to prevent, so the brighter delivery *is* the flourish.
   */
  deliveredWithBonus(): void {
    this.play('delivered-bonus');
  }

  /** Cargo picked up. The two-leg contracts used to have a silent middle. */
  cargoCollected(): void {
    this.play('cargo-collected');
  }

  /** A board slot armed by the first digit press, awaiting its confirmation. */
  boardArmed(): void {
    this.play('board-armed');
  }

  /** A skill point spent. Deliberate, unlike the level that earned it. */
  skillRanked(): void {
    this.play('skill-ranked');
  }

  /** Standing risen to a new tier, which changes what deliveries pay. */
  standingRisen(): void {
    this.play('standing-risen');
  }

  /** An achievement unlocked, which otherwise arrives inside a grouped toast. */
  achievementUnlocked(): void {
    this.play('achievement');
  }

  /** First arrival at a settlement. */
  settlementFound(): void {
    this.play('settlement-found');
  }

  /** A wayside discovery revealed. */
  discoveryFound(): void {
    this.play('discovery');
  }

  /** Crossing a region gateway, which is otherwise a silent hard cut. */
  regionTravel(): void {
    this.play('region-travel');
  }

  /** The region's standing work is finished, alongside the summary panel. */
  regionCleared(): void {
    this.play('region-cleared');
  }

  /** A road encounter opened. */
  encounterStart(): void {
    this.play('encounter-start');
  }

  /** An encounter outcome that cost the courier. */
  encounterPaid(): void {
    this.play('encounter-paid');
  }

  /** An encounter outcome that paid the courier. */
  encounterGained(): void {
    this.play('encounter-gained');
  }

  /** The blockade broken: the end of the arc, and the fullest thing in the mix. */
  capstone(): void {
    this.play('capstone');
  }

  /** Someone started talking. */
  dialogueOpened(): void {
    this.play('dialogue-open');
  }

  /** The next line of a conversation. */
  dialogueAdvanced(): void {
    this.play('dialogue-advance');
  }

  /** A conversation choice taken. */
  dialogueChose(): void {
    this.play('dialogue-choice');
  }

  /** A panel opened: journal, skills, codex, minimap, upgrade shop. */
  panelOpened(): void {
    this.play('panel-open');
  }

  /** And closed again, by its own key or by Esc. */
  panelClosed(): void {
    this.play('panel-close');
  }

  /**
   * A key the player pressed that did nothing. The strongest item in the UI
   * batch: it is feedback about a press, and without it a refused key is
   * indistinguishable from an ignored one.
   */
  panelRefused(): void {
    this.play('panel-refused');
  }

  /** A message cleared off the queue. */
  toastDismissed(): void {
    this.play('toast-dismiss');
  }

  /** Starting over. Deliberate and rare, so not a tick. */
  newGame(): void {
    this.play('new-game');
  }

  /** The run is not being saved and will be lost when the tab closes. */
  saveFailed(): void {
    this.play('save-failed');
  }

  /**
   * Muted comes first, so a muted game requests nothing and the e2e can prove it.
   * Recording before queueing means a browser that cannot make sound still shows
   * the call site firing.
   */
  private play(id: AudioCueId): void {
    if (this.muted) {
      return;
    }
    this.lastCue = id;
    requestedLog = record(requestedLog, id);
    this.pending.push(id);
  }

  /** Command the bed, remembering the profile for the e2e hook. */
  private applyBed(profile: BedProfile): void {
    this.bedProfile = profile;
    this.output?.bed(profile);
  }
}

/**
 * One AudioContext per document, reused across scene restarts. The scene restarts
 * on region travel and on a new game, and browsers limit how many contexts a
 * document may create, so building one per scene would eventually fail.
 */
let sharedContext: AudioContext | null = null;
let contextUnavailable = false;

function audioContext(): AudioContext | null {
  if (contextUnavailable) {
    return null;
  }
  if (sharedContext !== null) {
    return sharedContext;
  }
  try {
    if (typeof AudioContext === 'undefined') {
      contextUnavailable = true;
      return null;
    }
    sharedContext = new AudioContext();
    return sharedContext;
  } catch {
    // Construction can throw in a sandboxed iframe or with autoplay hard-blocked.
    // Remembered, so this is not retried on every cue.
    contextUnavailable = true;
    return null;
  }
}

/**
 * The output graph, built once per document alongside the context. The master
 * gain and the bed voice both outlive any single scene, for the same reason the
 * context does, and a scene restart re-points at them rather than rebuilding.
 */
let sharedOutputHandle: AudioOutput | null = null;

/** Everything the output graph needs from an AudioContext. */
export interface OutputContext extends CueContext, BedContext {
  readonly state: AudioContextState;
  resume(): Promise<void>;
}

/**
 * Build the graph every voice passes through: a master gain into the
 * destination, with the bed already hanging off it, and cues joining it as they
 * fire. Returns null if the graph could not be built at all.
 *
 * Exported so the routing itself can be asserted (#383). Testing `synthesizeCue`
 * in isolation proves a cue can be pointed at a master gain; it says nothing
 * about whether the one the game plays through is, which is the difference
 * between a promise about a function and a promise about the game.
 *
 * Every method wraps the guarantee that sound never breaks a frame.
 */
export function createAudioOutput(ctx: OutputContext): AudioOutput | null {
  let master: GainNode;
  let voice: BedVoice;
  try {
    master = ctx.createGain();
    master.gain.setValueAtTime(MASTER_GAIN, ctx.currentTime);
    master.connect(ctx.destination);
    voice = createBedVoice(ctx, master);
  } catch {
    // No master, no bed: fall back to no output rather than to a half-built
    // graph. Silence is recoverable; a graph missing its gain node is not.
    return null;
  }
  return {
    play(cue: AudioCue): void {
      try {
        synthesizeCue(ctx, cue, master);
      } catch {
        // A cue is cosmetic; never let one break a frame.
      }
    },
    bed(profile: BedProfile): void {
      try {
        voice.update(profile);
      } catch {
        // Same promise as a cue, and a per-frame call is the worst possible
        // place to throw from.
      }
    },
    resume(): void {
      try {
        if (ctx.state === 'suspended') {
          void ctx.resume();
        }
      } catch {
        // Ignore: the next gesture will try again.
      }
    },
  };
}

/** The document's one output graph, built on first use and then reused. */
function sharedOutput(): AudioOutput | null {
  if (sharedOutputHandle !== null) {
    return sharedOutputHandle;
  }
  const ctx = audioContext();
  if (ctx === null) {
    return null;
  }
  sharedOutputHandle = createAudioOutput(ctx);
  if (sharedOutputHandle === null) {
    // Remembered, so a context that cannot build a graph is not retried per cue.
    contextUnavailable = true;
  }
  return sharedOutputHandle;
}
