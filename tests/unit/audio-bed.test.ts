import { describe, it, expect } from 'vitest';
import {
  BED_KNOCK_FRACTION,
  BED_MAX_GAIN,
  BED_MIN_GAIN,
  bedProfileFor,
  surfaceFor,
  type BedInput,
} from '../../src/systems/audio-bed';
import { TERRAIN_TYPES } from '../../src/data/terrain-types';
import { WEATHERS } from '../../src/systems/weather';
import { LOW_CONDITION_FRACTION } from '../../src/systems/wagon-condition';
import { allCues } from '../../src/systems/audio-cues';

// The rolling bed's decisions (#383). Pure, so the whole of "roads are gameplay,
// made audible" is arguable here without a sound device.

const BASE: BedInput = {
  speed: 100,
  referenceSpeed: 200,
  terrainId: 'plains',
  conditionFraction: 1,
  weatherId: 'clear',
};

function on(overrides: Partial<BedInput>): ReturnType<typeof bedProfileFor> {
  return bedProfileFor({ ...BASE, ...overrides });
}

describe('the bed gain', () => {
  it('is silent at a standstill', () => {
    // A parked wagon makes no rolling sound, and this is what lets a bed settle
    // rather than hum behind an open panel.
    expect(on({ speed: 0 }).gain).toBe(0);
  });

  it('treats a crawl of residual velocity as stopped', () => {
    // A drive arrives with drift, and a collision slide leaves a sliver of
    // velocity. Neither is rolling.
    expect(on({ speed: 1, referenceSpeed: 200 }).gain).toBe(0);
  });

  it('rises with speed', () => {
    const slow = on({ speed: 40 }).gain;
    const fast = on({ speed: 190 }).gain;
    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeGreaterThan(slow);
  });

  it('keeps a rolling wagon audible however slowly it limps', () => {
    // The floor exists so limping is not silent, which would be the opposite of
    // what a limp should feel like.
    const crawling = on({ speed: 10, referenceSpeed: 200, terrainId: 'road' }).gain;
    expect(crawling).toBeGreaterThan(0);
  });

  it('never exceeds its ceiling, on any surface in any weather at any speed', () => {
    // The bed plays continuously under every cue, so this is the one number that
    // cannot be allowed to drift: everything else has to be audible over it.
    for (const terrainId of Object.keys(TERRAIN_TYPES)) {
      for (const weather of WEATHERS) {
        for (const speed of [0, 1, 50, 200, 10_000]) {
          const profile = bedProfileFor({
            speed,
            referenceSpeed: 200,
            terrainId,
            conditionFraction: 0,
            weatherId: weather.id,
          });
          expect(profile.gain, `${terrainId}/${weather.id}/${speed}`).toBeLessThanOrEqual(
            BED_MAX_GAIN,
          );
          expect(profile.gain).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('stays under everything that marks a decision', () => {
    // The bed is a bed. Ticks deliberately sit down at its level (they are heard
    // as pitched transients against noise, not by being louder), but anything in
    // the cue tier and above marks a moment and has to clear it outright.
    const quietest = Math.min(...allCues().filter((c) => c.tier !== 'tick').map((c) => c.gain));
    expect(BED_MAX_GAIN).toBeLessThan(quietest);
    expect(BED_MIN_GAIN).toBeGreaterThan(0);
  });

  it('survives a zero reference speed rather than dividing by it', () => {
    // Turbo and speed multipliers feed the reference, and a boundary of exactly
    // zero would otherwise produce NaN and silently kill the bed forever.
    expect(on({ referenceSpeed: 0 }).gain).toBeLessThanOrEqual(BED_MAX_GAIN);
    expect(Number.isFinite(on({ referenceSpeed: 0 }).gain)).toBe(true);
  });
});

describe('the surface', () => {
  it('makes the road the thinnest and quietest ground', () => {
    // Design pillar 3. The reward for being on the road is that the wagon stops
    // complaining, and today that is only a number on the terrain readout.
    const road = on({ terrainId: 'road' });
    const marsh = on({ terrainId: 'marsh' });
    expect(road.centerHz).toBeGreaterThan(marsh.centerHz);
    expect(road.gain).toBeLessThan(marsh.gain);
  });

  it('separates paved, open, rough and wet ground by ear', () => {
    // Four voices, not eleven: the ear needs to hear which kind of ground this
    // is, not which of eleven terrain ids it is.
    const centres = ['road', 'plains', 'forest', 'deep-mire'].map((t) => on({ terrainId: t }).centerHz);
    expect(new Set(centres).size).toBe(4);
    // And they descend: smoother ground is thinner.
    expect(centres).toEqual([...centres].sort((a, b) => b - a));
  });

  it('gives every terrain the wagon can stand on a surface', () => {
    // A terrain that fell through to `unknown` would sound like plains in the
    // deep mire, which is the pillar being quietly untrue. Gated terrain counts:
    // it is impassable only until a capability opens it, and that is exactly the
    // ground the bed most needs to describe. Water and mountains are excluded
    // because the wagon never reaches them; bumping into one is a cue, not a bed.
    const standable = Object.values(TERRAIN_TYPES).filter(
      (t) => t.passable || t.unlockId !== undefined,
    );
    expect(standable.length).toBeGreaterThan(8);
    for (const terrain of standable) {
      expect(surfaceFor(terrain.id), `${terrain.id} has no bed surface`).not.toBe('unknown');
    }
  });

  it('falls back to a sound rather than to silence off the map', () => {
    // Silence would read as a bug, and the fallback path is the one nobody plays.
    const off = on({ terrainId: undefined });
    expect(off.surface).toBe('unknown');
    expect(off.gain).toBeGreaterThan(0);
  });

  it('reports the surface it used', () => {
    expect(on({ terrainId: 'bridge' }).surface).toBe('paved');
    expect(on({ terrainId: 'tidal-flat' }).surface).toBe('wet');
  });
});

describe('the weather filter', () => {
  it('thickens the bed in mud and thins it in a tailwind', () => {
    // The 2026-07-12 playtester who suspected weather did nothing was reading a
    // label. This is the cheapest possible way to make it felt.
    const clear = on({ weatherId: 'clear' }).centerHz;
    expect(on({ weatherId: 'mud' }).centerHz).toBeLessThan(clear);
    expect(on({ weatherId: 'fair-winds' }).centerHz).toBeGreaterThan(clear);
  });

  it('muffles under mist without claiming the wagon slowed', () => {
    // Mist costs sight, not speed (weather.ts), so the bed must not imply
    // otherwise: duller and quieter, but the gain change is small.
    const clear = on({ weatherId: 'clear' });
    const mist = on({ weatherId: 'mist' });
    expect(mist.centerHz).toBeLessThan(clear.centerHz);
    expect(mist.gain).toBeLessThan(clear.gain);
  });

  it('handles every weather the game can roll, and an unknown one', () => {
    for (const weather of WEATHERS) {
      expect(on({ weatherId: weather.id }).centerHz).toBeGreaterThan(0);
    }
    expect(on({ weatherId: 'thundersnow' }).centerHz).toBe(on({ weatherId: 'clear' }).centerHz);
  });
});

describe('the limp knock', () => {
  it('is absent on a healthy wagon', () => {
    expect(on({ conditionFraction: 1 }).knock).toBe(0);
    expect(on({ conditionFraction: 0.6 }).knock).toBe(0);
  });

  it('starts exactly where the HUD meter starts warning', () => {
    // The wagon must start sounding hurt when it starts looking hurt, or the two
    // channels disagree and the sound is telling the player something new, which
    // the design note's one rule forbids.
    expect(BED_KNOCK_FRACTION).toBe(LOW_CONDITION_FRACTION);
    expect(on({ conditionFraction: BED_KNOCK_FRACTION }).knock).toBe(0);
    expect(on({ conditionFraction: BED_KNOCK_FRACTION - 0.01 }).knock).toBeGreaterThan(0);
  });

  it('deepens as the wagon gets worse', () => {
    // A ramp, not a switch: nearly stranded should knock harder than just dipped.
    expect(on({ conditionFraction: 0.05 }).knock).toBeGreaterThan(
      on({ conditionFraction: 0.25 }).knock,
    );
    expect(on({ conditionFraction: 0 }).knock).toBe(1);
  });

  it('stays in range for nonsense condition values', () => {
    expect(on({ conditionFraction: -5 }).knock).toBe(1);
    expect(on({ conditionFraction: 99 }).knock).toBe(0);
  });

  it('describes the wagon even while stopped', () => {
    // Only gain is about speed. Everything else describes the ground and the
    // wagon, which is what lets the voice fade out over a surface rather than
    // jumping to a default one on the frame the player stops.
    const stopped = on({ speed: 0, terrainId: 'marsh', conditionFraction: 0.1 });
    expect(stopped.gain).toBe(0);
    expect(stopped.surface).toBe('wet');
    expect(stopped.knock).toBeGreaterThan(0);
  });
});
