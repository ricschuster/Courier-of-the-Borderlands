import { describe, it, expect } from 'vitest';
import { chooseCue, MASTER_GAIN } from '../../src/systems/audio-mix';
import { allCues, cueFor, tierRank } from '../../src/systems/audio-cues';

// One cue voice per frame (#383). The rule is pure so it can be argued about
// here rather than in a scene, and because it has no observable effect in the
// browser other than through the e2e hook: with no sound device, a suppressed cue
// and a played cue are the same silence.

describe('chooseCue', () => {
  it('plays nothing on an empty frame, which is most frames', () => {
    expect(chooseCue([])).toBeNull();
  });

  it('plays the only cue when only one is asked for', () => {
    expect(chooseCue(['delivered'])).toBe('delivered');
  });

  it('drops the quieter tiers when a delivery arrival stacks', () => {
    // The real case from the issue: arriving at a destination raises the delivery,
    // an achievement, a settlement note and sometimes a level-up in one frame.
    // Five oscillators starting on the same sample is mud.
    expect(chooseCue(['delivered', 'level-up', 'road-joined'])).toBe('delivered');
  });

  it('lets a higher tier win no matter when it was requested', () => {
    // Order must not decide this. A stranding that happens to be requested last
    // is still the loudest thing in the frame.
    expect(chooseCue(['road-joined', 'delivered', 'stranded'])).toBe('stranded');
    expect(chooseCue(['stranded', 'delivered', 'road-joined'])).toBe('stranded');
  });

  it('breaks a tier tie on gain', () => {
    // Both `cue` tier; the delivery is the louder of the two, so it is the one
    // the moment is about.
    expect(chooseCue(['repaired', 'delivered'])).toBe('delivered');
    expect(chooseCue(['delivered', 'repaired'])).toBe('delivered');
  });

  it('breaks an exact tie on request order', () => {
    // Same tier and the same gain: the earlier request is the one closer to
    // whatever caused it, so it wins. Pinned because the alternative (whichever
    // the loop happens to see last) is a coin flip that would make a spec flaky.
    expect(cueFor('road-joined').gain).toBe(cueFor('road-left').gain);
    expect(chooseCue(['road-joined', 'road-left'])).toBe('road-joined');
    expect(chooseCue(['road-left', 'road-joined'])).toBe('road-left');
  });

  it('lets an encounter beat the tick that opened its dialogue', () => {
    // Both are wanted and both are requested in the same frame (#384): every
    // conversation ticks, and an encounter is a conversation that arrived on its
    // own. This is the collision the rule was written for.
    expect(chooseCue(['dialogue-open', 'encounter-start'])).toBe('encounter-start');
  });

  it('never lets the capstone lose its frame', () => {
    // The finale clears the whole toast queue when it appears, so whatever was
    // mid-flight is competing with it. It has to win against everything,
    // including a stranding on the same frame.
    for (const cue of allCues().filter((c) => c.id !== 'capstone')) {
      expect(chooseCue([cue.id, 'capstone']), `${cue.id} suppressed the capstone`).toBe('capstone');
      expect(chooseCue(['capstone', cue.id])).toBe('capstone');
    }
  });

  it('never picks a cue that was not asked for', () => {
    // Sounds obvious; it is the failure a lookup-table refactor would introduce.
    for (const cue of allCues()) {
      expect(chooseCue([cue.id])).toBe(cue.id);
    }
  });

  it('always returns the highest-ranked tier present', () => {
    // The property behind every example above, checked across the whole table so
    // a new cue cannot quietly break it.
    const ids = allCues().map((c) => c.id);
    for (const a of ids) {
      for (const b of ids) {
        const winner = chooseCue([a, b]);
        expect(winner).not.toBeNull();
        const best = Math.max(tierRank(cueFor(a).tier), tierRank(cueFor(b).tier));
        expect(tierRank(cueFor(winner as typeof a).tier)).toBe(best);
      }
    }
  });
});

describe('the master gain', () => {
  it('leaves headroom rather than sitting at unity', () => {
    // Its whole job. The per-cue gains were tuned in #382 against silence and now
    // sit on top of a continuous bed, and there is no volume control in the game
    // for a player to compensate with.
    expect(MASTER_GAIN).toBeGreaterThan(0);
    expect(MASTER_GAIN).toBeLessThan(1);
  });
});
