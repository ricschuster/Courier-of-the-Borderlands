import { describe, it, expect } from 'vitest';
import {
  drivingAudioCues,
  initialDrivingAudioMemory,
  BUMP_COOLDOWN_FRAMES,
  type DrivingAudioFrame,
  type DrivingAudioMemory,
} from '../../src/systems/driving-audio';

// The driving cue rules (#383), made testable by the #392 extraction. Both
// depend on the previous frame, which is exactly the sort of rule that is
// invisible to a browser spec: the arc suite can prove a cue fired, not that it
// fired on the right frame or that it stopped firing on the next one.

function frame(overrides: Partial<DrivingAudioFrame> = {}): DrivingAudioFrame {
  return {
    driving: true,
    rolling: true,
    frameNo: 100,
    terrainId: 'plains',
    ...overrides,
  };
}

/** Run a sequence of frames, returning every cue in order plus the final memory. */
function run(
  frames: readonly Partial<DrivingAudioFrame>[],
  start: DrivingAudioMemory = initialDrivingAudioMemory(),
): { cues: string[]; memory: DrivingAudioMemory } {
  let memory = start;
  const cues: string[] = [];
  for (const f of frames) {
    const result = drivingAudioCues(frame(f), memory);
    cues.push(...result.cues);
    memory = result.memory;
  }
  return { cues, memory };
}

describe('drivingAudioCues', () => {
  describe('the first frame is silent', () => {
    it('does not treat spawning on a road as joining one', () => {
      const { cues } = run([{ terrainId: 'road' }]);

      expect(cues).toEqual([]);
    });

    it('does not bump on the first frame of a press', () => {
      // Velocity is set in update() but the body does not move until physics
      // runs, so frame one always looks blocked. wasDriving is what tells them
      // apart.
      const { cues } = run([{ driving: true, rolling: false }]);

      expect(cues).toEqual([]);
    });
  });

  describe('the bump', () => {
    it('fires when a held key stops producing movement', () => {
      const { cues } = run([
        { driving: true, rolling: true },
        { driving: true, rolling: false },
      ]);

      expect(cues).toEqual(['bump']);
    });

    it('does not fire when the wagon is simply standing still', () => {
      const { cues } = run([
        { driving: false, rolling: false },
        { driving: false, rolling: false },
      ]);

      expect(cues).toEqual([]);
    });

    it('rate limits itself, so holding into a mountain knocks rather than buzzes', () => {
      // Ten consecutive blocked frames would be ten knocks without the cooldown.
      const frames = Array.from({ length: 10 }, (_, i) => ({
        driving: true,
        rolling: i === 0,
        frameNo: 100 + i,
      }));

      const { cues } = run(frames);

      expect(cues).toEqual(['bump']);
    });

    it('knocks again once the cooldown has elapsed', () => {
      const { memory } = run([
        { driving: true, rolling: true, frameNo: 100 },
        { driving: true, rolling: false, frameNo: 101 },
      ]);
      expect(memory.bumpReadyFrame).toBe(101 + BUMP_COOLDOWN_FRAMES);

      const later = drivingAudioCues(
        frame({ driving: true, rolling: false, frameNo: 101 + BUMP_COOLDOWN_FRAMES }),
        memory,
      );

      expect(later.cues).toEqual(['bump']);
    });

    it('stays silent one frame before the cooldown expires', () => {
      const { memory } = run([
        { driving: true, rolling: true, frameNo: 100 },
        { driving: true, rolling: false, frameNo: 101 },
      ]);

      const tooSoon = drivingAudioCues(
        frame({ driving: true, rolling: false, frameNo: 100 + BUMP_COOLDOWN_FRAMES }),
        memory,
      );

      expect(tooSoon.cues).toEqual([]);
    });
  });

  describe('terrain crossings', () => {
    it('sounds joining a road, once, on the frame the ground changes', () => {
      const { cues } = run([
        { terrainId: 'plains' },
        { terrainId: 'road' },
        { terrainId: 'road' },
        { terrainId: 'road' },
      ]);

      expect(cues).toEqual(['road-joined']);
    });

    it('sounds leaving a road', () => {
      const { cues } = run([{ terrainId: 'road' }, { terrainId: 'plains' }]);

      expect(cues).toEqual(['road-left']);
    });

    it('treats a bridge as paved, so road to bridge is not a crossing', () => {
      const { cues } = run([{ terrainId: 'road' }, { terrainId: 'bridge' }]);

      expect(cues).toEqual([]);
    });

    it('says nothing when one unpaved ground becomes another', () => {
      const { cues } = run([{ terrainId: 'plains' }, { terrainId: 'forest' }]);

      expect(cues).toEqual([]);
    });
  });

  describe('gated ground', () => {
    it('sounds a ford crossing, which a capability opened', () => {
      const { cues } = run([{ terrainId: 'plains' }, { terrainId: 'ford-greybridge' }]);

      expect(cues).toContain('ford-crossed');
    });

    it('distinguishes deep mire from an ordinary ford', () => {
      const { cues } = run([{ terrainId: 'plains' }, { terrainId: 'deep-mire' }]);

      expect(cues).toContain('gated-ground');
      expect(cues).not.toContain('ford-crossed');
    });

    it('can report leaving the road and reaching gated ground in one frame', () => {
      // Both fire; the mix keeps one voice per frame, so the tier decides which
      // is heard. That arbitration is deliberately not this module's business.
      const { cues } = run([{ terrainId: 'road' }, { terrainId: 'deep-mire' }]);

      expect(cues).toEqual(['road-left', 'gated-ground']);
    });
  });

  it('remembers the ground even on a silent crossing, so the next one is judged from it', () => {
    const { memory } = run([{ terrainId: 'plains' }, { terrainId: 'forest' }]);

    expect(memory.prevTerrainId).toBe('forest');
    expect(memory.prevTerrainKnown).toBe(true);
  });
});
