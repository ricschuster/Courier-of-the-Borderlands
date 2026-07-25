import { cueFor, type AudioCue, type AudioCueId } from '../systems/audio-cues';
import { loadAudioMuted, saveAudioMuted } from '../systems/audio-preference';

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

/** The audible part, separated so the class is testable without WebAudio. */
interface AudioOutput {
  play(cue: AudioCue): void;
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
 * Exported for the tests described on CueContext. Throws nothing on its own; the
 * caller owns the catch.
 */
export function synthesizeCue(ctx: CueContext, cue: AudioCue): void {
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
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(end);
}

/**
 * Scene-lifetime sound. Construct one per create(); it holds no global state
 * beyond its own AudioContext, which browsers cap per document, so it is created
 * lazily and reused across scene restarts via a module-level handle.
 */
export class Audio {
  private muted: boolean;
  private readonly output: AudioOutput | null;
  private lastCue: AudioCueId | null = null;

  /**
   * @param silent true to build with no output at all (the e2e runs). Cues are
   *   still recorded, so specs can prove the call sites fire.
   */
  constructor(silent: boolean) {
    this.muted = loadAudioMuted();
    this.output = silent ? null : webAudioOutput();
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
    return this.muted;
  }

  /**
   * The cue most recently requested, or null if none has been since the last
   * reset. Exposed for the e2e hook only: with no sound device in CI this is the
   * only evidence that a call site fired at all.
   */
  lastRequestedCue(): AudioCueId | null {
    return this.lastCue;
  }

  /** Clear the record, so a spec can assert that the next action requested nothing. */
  clearLastRequestedCue(): void {
    this.lastCue = null;
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

  /** A contract was committed to. The quietest cue in the table. */
  contractAccepted(): void {
    this.play('contract-accepted');
  }

  /**
   * Muted comes first, so a muted game requests nothing and the e2e can prove it.
   * Recording before playing means a browser that cannot make sound still shows
   * the call site firing.
   */
  private play(id: AudioCueId): void {
    if (this.muted) {
      return;
    }
    this.lastCue = id;
    this.output?.play(cueFor(id));
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

/** Wraps the synthesis in the guarantee that a cue never breaks a frame. */
function webAudioOutput(): AudioOutput | null {
  const ctx = audioContext();
  if (ctx === null) {
    return null;
  }
  return {
    play(cue: AudioCue): void {
      try {
        synthesizeCue(ctx, cue);
      } catch {
        // A cue is cosmetic; never let one break a frame.
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
