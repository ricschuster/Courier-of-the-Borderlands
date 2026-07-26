// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Audio, synthesizeCue, type CueContext } from '../../src/scenes/audio';
import { allCues, cueFor } from '../../src/systems/audio-cues';
import { AUDIO_MUTED_KEY, loadAudioMuted } from '../../src/systems/audio-preference';

// The Audio class takes no Phaser scene, so it is testable here rather than only
// in the browser. Built with silent=true (the e2e shape): no AudioContext, but
// cues are still recorded, which is the whole mechanism the e2e specs read.
//
// jsdom has no AudioContext at all, which makes it a fair stand-in for a browser
// that cannot make sound: the last test below leans on that.

describe('Audio', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('requests a cue for each moment', () => {
    const audio = new Audio(true);
    audio.delivered();
    expect(audio.lastRequestedCue()).toBe('delivered');
    audio.stranded();
    expect(audio.lastRequestedCue()).toBe('stranded');
    audio.repairRefused();
    expect(audio.lastRequestedCue()).toBe('repair-refused');
    audio.routeUnlocked();
    expect(audio.lastRequestedCue()).toBe('route-unlocked');
    audio.upgradeFitted();
    expect(audio.lastRequestedCue()).toBe('upgrade-fitted');
    audio.repaired();
    expect(audio.lastRequestedCue()).toBe('repaired');
    audio.levelUp();
    expect(audio.lastRequestedCue()).toBe('level-up');
    audio.contractAccepted();
    expect(audio.lastRequestedCue()).toBe('contract-accepted');
  });

  it('requests nothing at all while muted', () => {
    // The dangerous version of this bug is a mute flag that is stored and then
    // ignored at the point of play. Requesting nothing is what makes muting
    // observable, in this test and in the browser.
    const audio = new Audio(true);
    audio.toggleMuted();
    audio.delivered();
    audio.stranded();
    expect(audio.lastRequestedCue()).toBeNull();
  });

  it('resumes requesting cues when unmuted again', () => {
    const audio = new Audio(true);
    audio.toggleMuted();
    audio.delivered();
    expect(audio.lastRequestedCue()).toBeNull();
    audio.toggleMuted();
    audio.delivered();
    expect(audio.lastRequestedCue()).toBe('delivered');
  });

  it('starts unmuted and reports its state', () => {
    const audio = new Audio(true);
    expect(audio.isMuted()).toBe(false);
    expect(audio.toggleMuted()).toBe(true);
    expect(audio.isMuted()).toBe(true);
    expect(audio.toggleMuted()).toBe(false);
  });

  it('persists the preference as it toggles', () => {
    const audio = new Audio(true);
    audio.toggleMuted();
    expect(loadAudioMuted()).toBe(true);
    expect(localStorage.getItem(AUDIO_MUTED_KEY)).not.toBeNull();
    audio.toggleMuted();
    expect(loadAudioMuted()).toBe(false);
  });

  it('picks up a stored mute on construction, so it survives a scene restart', () => {
    // The scene is rebuilt on region travel and on a new game, so this is the path
    // that keeps a muted game muted after crossing a gateway.
    new Audio(true).toggleMuted();
    const next = new Audio(true);
    expect(next.isMuted()).toBe(true);
    next.delivered();
    expect(next.lastRequestedCue()).toBeNull();
  });

  it('clears the recorded cue on request', () => {
    // How a spec sets up "prove the next action requested nothing".
    const audio = new Audio(true);
    audio.delivered();
    audio.clearLastRequestedCue();
    expect(audio.lastRequestedCue()).toBeNull();
  });

  it('still records cues when the browser has no audio at all', () => {
    // jsdom has no AudioContext, so this constructs the non-silent path against a
    // browser that cannot make sound. It must degrade to no output rather than
    // throw, and the wiring must stay observable.
    expect(typeof AudioContext).toBe('undefined');
    const audio = new Audio(false);
    expect(() => audio.delivered()).not.toThrow();
    expect(audio.lastRequestedCue()).toBe('delivered');
  });

  it('unlocking is safe with no output to unlock', () => {
    const audio = new Audio(true);
    expect(() => audio.unlock()).not.toThrow();
  });

  it('requests a cue for each driving moment', () => {
    const audio = new Audio(true);
    audio.roadJoined();
    expect(audio.lastRequestedCue()).toBe('road-joined');
    audio.roadLeft();
    expect(audio.lastRequestedCue()).toBe('road-left');
    audio.gatedGround();
    expect(audio.lastRequestedCue()).toBe('gated-ground');
    audio.fordCrossed();
    expect(audio.lastRequestedCue()).toBe('ford-crossed');
    audio.fordBlocked();
    expect(audio.lastRequestedCue()).toBe('ford-blocked');
    audio.bumped();
    expect(audio.lastRequestedCue()).toBe('bump');
  });

  it('requests a cue for each world, story and progression moment', () => {
    const audio = new Audio(true);
    const moments: readonly [() => void, string][] = [
      [() => audio.deliveredWithBonus(), 'delivered-bonus'],
      [() => audio.cargoCollected(), 'cargo-collected'],
      [() => audio.boardArmed(), 'board-armed'],
      [() => audio.skillRanked(), 'skill-ranked'],
      [() => audio.standingRisen(), 'standing-risen'],
      [() => audio.achievementUnlocked(), 'achievement'],
      [() => audio.settlementFound(), 'settlement-found'],
      [() => audio.discoveryFound(), 'discovery'],
      [() => audio.regionTravel(), 'region-travel'],
      [() => audio.regionCleared(), 'region-cleared'],
      [() => audio.encounterStart(), 'encounter-start'],
      [() => audio.encounterPaid(), 'encounter-paid'],
      [() => audio.encounterGained(), 'encounter-gained'],
      [() => audio.capstone(), 'capstone'],
      [() => audio.dialogueOpened(), 'dialogue-open'],
      [() => audio.dialogueAdvanced(), 'dialogue-advance'],
      [() => audio.dialogueChose(), 'dialogue-choice'],
    ];
    for (const [fire, id] of moments) {
      fire();
      expect(audio.lastRequestedCue()).toBe(id);
    }
  });

  it('requests a cue for each UI moment', () => {
    const audio = new Audio(true);
    audio.panelOpened();
    expect(audio.lastRequestedCue()).toBe('panel-open');
    audio.panelClosed();
    expect(audio.lastRequestedCue()).toBe('panel-close');
    audio.panelRefused();
    expect(audio.lastRequestedCue()).toBe('panel-refused');
    audio.toastDismissed();
    expect(audio.lastRequestedCue()).toBe('toast-dismiss');
    audio.newGame();
    expect(audio.lastRequestedCue()).toBe('new-game');
    audio.saveFailed();
    expect(audio.lastRequestedCue()).toBe('save-failed');
  });

  it('has a method for every cue in the table', () => {
    // A cue in the table with no method is a cue with no possible caller, which
    // is trap 1's first shape sitting in plain sight. Fires every method and
    // checks the set of ids they produce covers the table exactly.
    const audio = new Audio(true);
    const fired = new Set<string>();
    // The zero-argument methods that are not cue triggers. Named rather than
    // detected, because the interesting failure is a new cue with no method, and
    // an over-clever filter would hide it. toggleMuted in particular must not be
    // swept: it would silence the rest of the run and the set would come back
    // empty rather than short.
    const notCues = new Set([
      'constructor',
      'isMuted',
      'toggleMuted',
      'lastRequestedCue',
      'lastPlayedCue',
      'clearLastRequestedCue',
      'flushFrame',
      'settleBed',
      'bedState',
      'unlock',
    ]);
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(audio)).filter(
      (name) => !notCues.has(name),
    );
    for (const name of methods) {
      const fn = (audio as unknown as Record<string, unknown>)[name];
      if (typeof fn !== 'function' || fn.length > 0) {
        continue;
      }
      audio.clearLastRequestedCue();
      (fn as () => void).call(audio);
      const id = audio.lastRequestedCue();
      if (id !== null) {
        fired.add(id);
      }
    }
    const inTable = allCues().map((c) => c.id).sort();
    expect([...fired].sort()).toEqual(inTable);
  });
});

describe('one cue voice per frame', () => {
  // The mute preference persists, so each of these has to start from a clean
  // store or a mute set by the previous test leaks in as the starting state.
  beforeEach(() => {
    localStorage.clear();
  });

  // The scene flushes at the top of update(), so a "frame" here is everything
  // requested between two flushes (#383).

  it('plays the winner of the frame, not the last thing requested', () => {
    // The distinction that matters: `lastRequestedCue` answers "does this call
    // site exist", `lastPlayedCue` answers "what did the player hear". Conflating
    // them would make the collision rule unobservable.
    const audio = new Audio(true);
    audio.stranded();
    audio.roadJoined();
    expect(audio.lastRequestedCue()).toBe('road-joined');
    expect(audio.lastPlayedCue()).toBeNull();
    audio.flushFrame();
    expect(audio.lastPlayedCue()).toBe('stranded');
  });

  it('plays each frame separately', () => {
    // The loser is dropped, not carried into the next frame: a cue that arrives
    // late is detached from the moment it described.
    const audio = new Audio(true);
    audio.delivered();
    audio.roadJoined();
    audio.flushFrame();
    expect(audio.lastPlayedCue()).toBe('delivered');
    audio.roadLeft();
    audio.flushFrame();
    expect(audio.lastPlayedCue()).toBe('road-left');
  });

  it('leaves the record alone on an empty frame', () => {
    // Most frames request nothing, and they must not wipe what was just heard.
    const audio = new Audio(true);
    audio.delivered();
    audio.flushFrame();
    audio.flushFrame();
    audio.flushFrame();
    expect(audio.lastPlayedCue()).toBe('delivered');
  });

  it('plays nothing at all while muted', () => {
    const audio = new Audio(true);
    audio.toggleMuted();
    audio.stranded();
    audio.flushFrame();
    expect(audio.lastPlayedCue()).toBeNull();
  });

  it('drops requests made before a mute in the same frame', () => {
    // Pressing V is handled at the top of update(), but a cue can be requested by
    // an overlap callback outside update() entirely. Muting has to take effect
    // now, not one frame later.
    const audio = new Audio(true);
    audio.delivered();
    audio.toggleMuted();
    audio.flushFrame();
    expect(audio.lastPlayedCue()).toBeNull();
  });
});

describe('the rolling bed', () => {
  // The mute preference persists, so each of these has to start from a clean
  // store or a mute set by the previous test leaks in as the starting state.
  beforeEach(() => {
    localStorage.clear();
  });

  const rolling = {
    speed: 100,
    referenceSpeed: 200,
    terrainId: 'plains',
    conditionFraction: 1,
    weatherId: 'clear',
  };

  it('starts silent, before the scene has said anything about the wagon', () => {
    expect(new Audio(true).bedState().gain).toBe(0);
  });

  it('reports what the ground is doing', () => {
    // The e2e hook's only window onto a continuous voice: it has no "last cue".
    const audio = new Audio(true);
    audio.updateBed(rolling);
    expect(audio.bedState().gain).toBeGreaterThan(0);
    expect(audio.bedState().surface).toBe('open');
    audio.updateBed({ ...rolling, terrainId: 'road' });
    expect(audio.bedState().surface).toBe('paved');
  });

  it('settles over the ground it stopped on', () => {
    // Freezing behind a panel must not teleport the bed to a default surface, or
    // the settle would change timbre on the way down.
    const audio = new Audio(true);
    audio.updateBed({ ...rolling, terrainId: 'marsh' });
    audio.settleBed();
    expect(audio.bedState().gain).toBe(0);
    expect(audio.bedState().surface).toBe('wet');
  });

  it('settles safely before the scene has ever driven', () => {
    // The scene-shutdown path can fire on a scene that never got a frame.
    const audio = new Audio(true);
    expect(() => audio.settleBed()).not.toThrow();
    expect(audio.bedState().gain).toBe(0);
  });

  it('is silenced by mute, not merely left unrequested', () => {
    // The dangerous shape of this bug: the bed is a voice rather than a request,
    // so a mute that only stops cues would leave the wheels rolling, which is the
    // loudest possible way to fail to mute.
    const audio = new Audio(true);
    audio.updateBed(rolling);
    expect(audio.bedState().gain).toBeGreaterThan(0);
    audio.toggleMuted();
    expect(audio.bedState().gain).toBe(0);
    audio.updateBed(rolling);
    expect(audio.bedState().gain).toBe(0);
  });

  it('comes back when the player unmutes', () => {
    const audio = new Audio(true);
    audio.toggleMuted();
    audio.updateBed(rolling);
    expect(audio.bedState().gain).toBe(0);
    audio.toggleMuted();
    audio.updateBed(rolling);
    expect(audio.bedState().gain).toBeGreaterThan(0);
  });
});

describe('synthesizeCue', () => {
  // The node-building is wrapped in a catch so a cue can never break a frame,
  // which means a broken sequence would be silently silent and every other test
  // here would still pass. That is trap 1's second shape: a path whose broken and
  // correct behaviour look identical. So the schedule is asserted directly.

  interface Call {
    readonly name: string;
    readonly args: readonly number[];
  }

  function recorder(): { ctx: CueContext; calls: Call[]; connections: number } {
    const calls: Call[] = [];
    const state = { connections: 0 };
    const param = (label: string): AudioParam =>
      ({
        setValueAtTime: (v: number, t: number) => calls.push({ name: `${label}.set`, args: [v, t] }),
        linearRampToValueAtTime: (v: number, t: number) =>
          calls.push({ name: `${label}.linear`, args: [v, t] }),
        exponentialRampToValueAtTime: (v: number, t: number) =>
          calls.push({ name: `${label}.exp`, args: [v, t] }),
      }) as unknown as AudioParam;
    const ctx = {
      currentTime: 10,
      destination: {} as AudioNode,
      createOscillator: () =>
        ({
          set type(v: string) {
            calls.push({ name: `osc.type:${v}`, args: [] });
          },
          frequency: param('freq'),
          connect: () => (state.connections += 1),
          start: (t: number) => calls.push({ name: 'osc.start', args: [t] }),
          stop: (t: number) => calls.push({ name: 'osc.stop', args: [t] }),
        }) as unknown as OscillatorNode,
      createGain: () =>
        ({
          gain: param('gain'),
          connect: () => (state.connections += 1),
        }) as unknown as GainNode,
    } satisfies CueContext;
    return {
      ctx,
      calls,
      get connections() {
        return state.connections;
      },
    };
  }

  it('schedules an audible envelope for every cue in the table', () => {
    // The whole point: each cue must actually reach its peak gain and then decay,
    // and must start and stop. A cue that scheduled nothing would be inaudible.
    for (const cue of allCues()) {
      const rec = recorder();
      synthesizeCue(rec.ctx, cue);
      const names = rec.calls.map((c) => c.name);
      expect(names, `${cue.id} never started`).toContain('osc.start');
      expect(names, `${cue.id} never stopped`).toContain('osc.stop');
      const peak = rec.calls.find((c) => c.name === 'gain.linear');
      expect(peak?.args[0], `${cue.id} never reaches its peak gain`).toBe(cue.gain);
      const decay = rec.calls.find((c) => c.name === 'gain.exp');
      expect(decay?.args[0], `${cue.id} never decays`).toBeGreaterThan(0);
      expect(rec.connections, `${cue.id} is not connected to the output`).toBe(2);
    }
  });

  it('starts silent and runs for the cue duration', () => {
    const cue = cueFor('delivered');
    const rec = recorder();
    synthesizeCue(rec.ctx, cue);
    // Starting at 0 is what makes the attack an attack rather than a click.
    expect(rec.calls.find((c) => c.name === 'gain.set')?.args).toEqual([0, 10]);
    expect(rec.calls.find((c) => c.name === 'osc.start')?.args).toEqual([10]);
    expect(rec.calls.find((c) => c.name === 'osc.stop')?.args).toEqual([
      10 + cue.durationMs / 1000,
    ]);
    expect(rec.calls.find((c) => c.name === 'gain.linear')?.args).toEqual([
      cue.gain,
      10 + cue.attackMs / 1000,
    ]);
  });

  it('slides the pitch only when the cue actually changes pitch', () => {
    // exponentialRampToValueAtTime on an unchanged frequency is pointless work,
    // and the one flat cue in the table would otherwise schedule a no-op ramp.
    const sliding = recorder();
    synthesizeCue(sliding.ctx, cueFor('delivered'));
    expect(sliding.calls.map((c) => c.name)).toContain('freq.exp');

    const flat = recorder();
    synthesizeCue(flat.ctx, cueFor('contract-accepted'));
    expect(flat.calls.map((c) => c.name)).not.toContain('freq.exp');
  });

  it('routes through the master gain when it is given one', () => {
    // Every voice has to pass the single node a volume slider will one day write
    // to (#383). A cue wired straight to the destination would bypass it and be
    // the one sound the slider could not turn down.
    const targets: unknown[] = [];
    const rec = recorder();
    const ctx: CueContext = {
      ...rec.ctx,
      createGain: () =>
        ({
          gain: {
            setValueAtTime: () => undefined,
            linearRampToValueAtTime: () => undefined,
            exponentialRampToValueAtTime: () => undefined,
          } as unknown as AudioParam,
          connect: (to: unknown) => targets.push(to),
        }) as unknown as GainNode,
    };
    const master = { label: 'master' } as unknown as AudioNode;
    synthesizeCue(ctx, cueFor('delivered'), master);
    expect(targets).toEqual([master]);
  });

  it('falls back to the destination with no master gain', () => {
    // The default keeps the graph complete for callers that predate the master,
    // rather than leaving a cue connected to nothing at all.
    const targets: unknown[] = [];
    const rec = recorder();
    const ctx: CueContext = {
      ...rec.ctx,
      createGain: () =>
        ({
          gain: {
            setValueAtTime: () => undefined,
            linearRampToValueAtTime: () => undefined,
            exponentialRampToValueAtTime: () => undefined,
          } as unknown as AudioParam,
          connect: (to: unknown) => targets.push(to),
        }) as unknown as GainNode,
    };
    synthesizeCue(ctx, cueFor('delivered'));
    expect(targets).toEqual([ctx.destination]);
  });

  it('never decays to exactly zero, which WebAudio cannot ramp to', () => {
    // exponentialRampToValueAtTime throws on a zero target in real browsers, and
    // the catch upstream would turn that into permanent silence.
    for (const cue of allCues()) {
      const rec = recorder();
      synthesizeCue(rec.ctx, cue);
      expect(rec.calls.find((c) => c.name === 'gain.exp')?.args[0]).toBeGreaterThan(0);
    }
  });
});
