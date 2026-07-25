import { describe, it, expect } from 'vitest';
import { createBedVoice, type BedContext } from '../../src/scenes/audio-bed-voice';
import { createAudioOutput, type OutputContext } from '../../src/scenes/audio';
import { cueFor } from '../../src/systems/audio-cues';
import { MASTER_GAIN } from '../../src/systems/audio-mix';
import { bedProfileFor, type BedProfile } from '../../src/systems/audio-bed';

// The bed's node graph, asserted directly against a recording double.
//
// This exists for the same reason the synthesizeCue tests do, and the reason is
// trap 1's second shape: `createBedVoice` and every `update` are wrapped in a
// catch upstream so a continuous voice can never break a frame, which means a bed
// that was never connected to the output, or that never actually started, would
// be *silently* silent with every other test in the suite still green. The e2e
// hook cannot catch it either, because the hook reports the profile the scene
// commanded, not what the graph did with it.

interface Call {
  readonly name: string;
  readonly args: readonly number[];
}

function recorder(): {
  ctx: BedContext;
  output: AudioNode;
  calls: Call[];
  connections: string[];
} {
  const calls: Call[] = [];
  const connections: string[] = [];
  const output = { label: 'master' } as unknown as AudioNode;
  const param = (label: string): AudioParam =>
    ({
      setValueAtTime: (v: number, t: number) => calls.push({ name: `${label}.set`, args: [v, t] }),
      setTargetAtTime: (v: number, t: number, c: number) =>
        calls.push({ name: `${label}.target`, args: [v, t, c] }),
      // The bed only ever uses set/setTarget, but a cue played through the same
      // output graph uses the ramps, and a param double missing one would make
      // synthesizeCue throw into its own catch and look like a silent no-op.
      linearRampToValueAtTime: (v: number, t: number) =>
        calls.push({ name: `${label}.linear`, args: [v, t] }),
      exponentialRampToValueAtTime: (v: number, t: number) =>
        calls.push({ name: `${label}.exp`, args: [v, t] }),
    }) as unknown as AudioParam;

  const node = (label: string): Record<string, unknown> => ({
    connect: (to: unknown) => {
      const target = (to as { label?: string; nodeLabel?: string }) ?? {};
      connections.push(`${label}->${target.nodeLabel ?? target.label ?? 'param'}`);
    },
    disconnect: () => undefined,
    nodeLabel: label,
  });

  const ctx: BedContext = {
    currentTime: 5,
    sampleRate: 48_000,
    destination: { nodeLabel: 'destination' } as unknown as AudioNode,
    createBuffer: (channels: number, length: number) => {
      calls.push({ name: 'buffer', args: [channels, length] });
      const data = new Float32Array(length);
      return { getChannelData: () => data, length } as unknown as AudioBuffer;
    },
    createBufferSource: () =>
      ({
        ...node('source'),
        set buffer(_v: AudioBuffer | null) {
          calls.push({ name: 'source.buffer', args: [] });
        },
        set loop(v: boolean) {
          calls.push({ name: 'source.loop', args: [v ? 1 : 0] });
        },
        start: (t: number) => calls.push({ name: 'source.start', args: [t] }),
      }) as unknown as AudioBufferSourceNode,
    createBiquadFilter: () =>
      ({
        ...node('filter'),
        set type(v: string) {
          calls.push({ name: `filter.type:${v}`, args: [] });
        },
        frequency: param('freq'),
        Q: param('q'),
      }) as unknown as BiquadFilterNode,
    // Gains are labelled by build order (gain0, gain1, ...) rather than by role,
    // because the roles differ between the two things under test here: building
    // the bed alone makes three, building the whole output graph makes four with
    // the master first. Each test names the ones it means.
    createGain: () => {
      const label = `gain${calls.filter((c) => c.name === 'gain.created').length}`;
      calls.push({ name: 'gain.created', args: [] });
      return { ...node(label), gain: param(label) } as unknown as GainNode;
    },
    // Oscillators are labelled by build order too: osc0 is the bed's knock LFO,
    // and anything after it is a cue played through the same graph.
    createOscillator: () => {
      const label = `osc${calls.filter((c) => c.name === 'osc.created').length}`;
      calls.push({ name: 'osc.created', args: [] });
      return {
        ...node(label),
        set type(v: string) {
          calls.push({ name: `${label}.type:${v}`, args: [] });
        },
        frequency: param(`${label}Freq`),
        start: (t: number) => calls.push({ name: `${label}.start`, args: [t] }),
        stop: (t: number) => calls.push({ name: `${label}.stop`, args: [t] }),
      } as unknown as OscillatorNode;
    },
  };
  return { ctx, output, calls, connections };
}

/** The most recent recorded call with this name. The target lib predates findLast. */
function lastCall(calls: readonly Call[], name: string): Call | undefined {
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const call = calls[i];
    if (call !== undefined && call.name === name) {
      return call;
    }
  }
  return undefined;
}

function profile(overrides: Partial<BedProfile> = {}): BedProfile {
  return {
    ...bedProfileFor({
      speed: 100,
      referenceSpeed: 200,
      terrainId: 'plains',
      conditionFraction: 1,
      weatherId: 'clear',
    }),
    ...overrides,
  };
}

describe('createAudioOutput', () => {
  // The graph the game actually plays through, as opposed to the pieces. Every
  // assertion here is about a call site rather than a function: `synthesizeCue`
  // and `createBedVoice` are each tested in isolation and would both stay green
  // with the master gain bypassed, which is trap 1's function-with-no-caller in
  // its quietest form (the sound still comes out, it just cannot be turned down).

  function outputRecorder() {
    const rec = recorder();
    const ctx: OutputContext = {
      ...rec.ctx,
      state: 'running',
      resume: () => Promise.resolve(),
    };
    return { rec, ctx };
  }

  it('puts a master gain between everything and the destination', () => {
    // gain0 is built first and is the master; the bed's three gains follow.
    const { rec, ctx } = outputRecorder();
    expect(createAudioOutput(ctx)).not.toBeNull();
    expect(rec.connections[0]).toBe('gain0->destination');
    expect(rec.calls.find((c) => c.name === 'gain0.set')?.args[0]).toBe(MASTER_GAIN);
  });

  it('routes the bed into the master rather than the destination', () => {
    const { rec, ctx } = outputRecorder();
    createAudioOutput(ctx);
    // gain3 is the bed's own output gain, and the master is the only thing that
    // may touch the destination.
    expect(rec.connections).toContain('gain3->gain0');
    expect(rec.connections.filter((c) => c.endsWith('->destination'))).toEqual([
      'gain0->destination',
    ]);
  });

  it('routes a cue into the master too', () => {
    // A cue wired straight to the destination would be the one sound a future
    // volume slider could not turn down. This is the assertion the isolated
    // synthesizeCue test cannot make: that one proves a cue *can* be pointed at a
    // master gain, not that the one the game plays through is.
    const { rec, ctx } = outputRecorder();
    const output = createAudioOutput(ctx);
    const before = rec.connections.length;
    output?.play(cueFor('delivered'));
    expect(rec.connections.slice(before)).toEqual(['osc1->gain4', 'gain4->gain0']);
  });

  it('degrades to no output rather than to a half-built graph', () => {
    // Silence is recoverable. A master gain connected to the destination with
    // nothing behind it is a dead channel that every later cue joins.
    const { ctx } = outputRecorder();
    expect(
      createAudioOutput({
        ...ctx,
        createBufferSource: () => {
          throw new Error('no buffer sources here');
        },
      }),
    ).toBeNull();
  });

  it('never lets a broken cue or bed update break a frame', () => {
    // The promise the whole file rests on, and the reason every other test here
    // has to assert the graph directly rather than infer it from behaviour.
    const { ctx } = outputRecorder();
    let built = 0;
    const output = createAudioOutput({
      ...ctx,
      // The bed's LFO is the first oscillator; every cue after it throws.
      createOscillator: () => {
        built += 1;
        if (built > 1) {
          throw new Error('no oscillators after construction');
        }
        return ctx.createOscillator();
      },
    });
    expect(output).not.toBeNull();
    expect(() => output?.play(cueFor('delivered'))).not.toThrow();
    expect(() => output?.bed(profile())).not.toThrow();
  });
});

describe('createBedVoice', () => {
  it('builds a running, connected graph', () => {
    // The four ways a continuous voice can be born dead: no noise in the buffer,
    // never started, never looped, or never reaching the output.
    const rec = recorder();
    createBedVoice(rec.ctx, rec.output);
    const names = rec.calls.map((c) => c.name);
    expect(names, 'the noise source never started').toContain('source.start');
    expect(names, 'the knock LFO never started').toContain('osc0.start');
    expect(rec.calls.find((c) => c.name === 'source.loop')?.args).toEqual([1]);
    expect(names).toContain('filter.type:bandpass');
    expect(rec.connections, 'the bed never reaches the output').toContain('gain2->master');
  });

  it('routes noise through the filter and both gains, in that order', () => {
    // A graph that skipped the filter would play white noise at full width on
    // every surface, which is the pillar silently not happening.
    const rec = recorder();
    createBedVoice(rec.ctx, rec.output);
    // gain0 is the knock modulator, gain1 its depth, gain2 the bed's own output.
    expect(rec.connections).toEqual([
      'osc0->gain1',
      // The depth gain feeds an AudioParam (the knock gain's own .gain), not a
      // node, which is what makes this amplitude modulation rather than a mix.
      'gain1->param',
      'source->filter',
      'filter->gain0',
      'gain0->gain2',
      'gain2->master',
    ]);
  });

  it('allocates a noise buffer long enough not to sound like a pitch', () => {
    // A short loop of noise has an audible period, which reads as a tone.
    const rec = recorder();
    createBedVoice(rec.ctx, rec.output);
    const buffer = rec.calls.find((c) => c.name === 'buffer');
    expect(buffer?.args[0]).toBe(1);
    expect(buffer?.args[1]).toBeGreaterThanOrEqual(48_000);
  });

  it('fills the buffer with actual noise', () => {
    // An all-zero buffer is the quietest possible bug: the graph is perfect and
    // nothing comes out. Checked through the real fill, not a stub.
    const data = new Float32Array(2048);
    const rec = recorder();
    const ctx: BedContext = {
      ...rec.ctx,
      createBuffer: () => ({ getChannelData: () => data, length: data.length }) as unknown as AudioBuffer,
    };
    createBedVoice(ctx, rec.output);
    const nonZero = data.filter((v) => v !== 0).length;
    expect(nonZero).toBeGreaterThan(data.length * 0.9);
    expect(Math.max(...data)).toBeLessThanOrEqual(1);
    expect(Math.min(...data)).toBeGreaterThanOrEqual(-1);
  });

  it('starts silent, because it is built long before the wagon moves', () => {
    const rec = recorder();
    createBedVoice(rec.ctx, rec.output);
    expect(rec.calls.find((c) => c.name === 'gain2.set')?.args).toEqual([0, 5]);
  });

  it('ramps rather than jumps on every update', () => {
    // Terrain flips every few frames when driving along a road edge. A set would
    // click each time.
    const rec = recorder();
    const voice = createBedVoice(rec.ctx, rec.output);
    const before = rec.calls.length;
    voice.update(profile());
    const after = rec.calls.slice(before);
    expect(after.map((c) => c.name).sort()).toEqual([
      'freq.target',
      'gain1.target',
      'gain2.target',
      'q.target',
    ]);
  });

  it('rises quickly and settles slowly, so stopping is an event', () => {
    // The asymmetry IS the settle the design note asked for. Symmetric ramps
    // would make coming to rest an absence rather than a moment.
    const rec = recorder();
    const voice = createBedVoice(rec.ctx, rec.output);
    voice.update(profile({ gain: 0.06 }));
    const rise = lastCall(rec.calls, 'gain2.target');
    voice.update(profile({ gain: 0 }));
    const fall = lastCall(rec.calls, 'gain2.target');
    expect(rise?.args[0]).toBe(0.06);
    expect(fall?.args[0]).toBe(0);
    expect(fall?.args[2]).toBeGreaterThan(rise?.args[2] ?? 0);
  });

  it('leaves the knock off entirely on a healthy wagon', () => {
    const rec = recorder();
    const voice = createBedVoice(rec.ctx, rec.output);
    voice.update(profile({ knock: 0 }));
    expect(lastCall(rec.calls, 'gain1.target')?.args[0]).toBe(0);
  });

  it('never lets the knock chop the bed to silence', () => {
    // A badly hurt wagon should sound hurt, not broken. Full depth still leaves
    // most of the bed audible between knocks.
    const rec = recorder();
    const voice = createBedVoice(rec.ctx, rec.output);
    voice.update(profile({ knock: 1 }));
    const depth = lastCall(rec.calls, 'gain1.target')?.args[0] ?? 1;
    expect(depth).toBeGreaterThan(0);
    expect(depth).toBeLessThan(1);
  });
});
