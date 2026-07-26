// The rules behind the driving cues (#383), extracted from MapScene (#392).
//
// Two decisions live here, and both need memory of the previous frame, which is
// what made them worth lifting out of the scene together:
//
// 1. The bump. Driving into a mountain means holding the key down, so the knock
//    is rate limited or it becomes a buzz.
// 2. The terrain crossing. A cue fires on the frame the ground changes under the
//    wagon, not on every frame it spends there.
//
// This module is pure: it takes the frame's facts plus the memory, and returns
// the cues to play plus the next memory. The scene owns the Audio object and
// plays what it is handed, so these rules are unit-testable without Phaser.

import { getTerrain } from './terrain-system';

/**
 * Frames between bump knocks while the wagon is pressed into an impassable edge
 * (#383). Driving into a mountain means holding the key, so without a rate limit
 * this would be a buzz rather than a knock. Half a second at 60fps.
 */
export const BUMP_COOLDOWN_FRAMES = 30;

/** The cues the driving rules can ask for, in the order they are requested. */
export type DrivingCue = 'bump' | 'road-joined' | 'road-left' | 'gated-ground' | 'ford-crossed';

/** What the rules need to remember between frames. */
export interface DrivingAudioMemory {
  /**
   * True while the player was holding a movement key on the previous frame, so a
   * bump can be told from the first frame of a press: velocity is set in
   * update() but the body does not move until physics runs, so frame one always
   * looks blocked.
   */
  readonly wasDriving: boolean;
  /** The frame the bump cue may next fire on. */
  readonly bumpReadyFrame: number;
  /**
   * Terrain under the wagon on the previous frame. Undefined on the first frame
   * of a scene, which is why the first frame fires nothing: spawning on a road is
   * not "joining" one.
   */
  readonly prevTerrainId: string | undefined;
  readonly prevTerrainKnown: boolean;
}

export function initialDrivingAudioMemory(): DrivingAudioMemory {
  return {
    wasDriving: false,
    bumpReadyFrame: 0,
    prevTerrainId: undefined,
    prevTerrainKnown: false,
  };
}

export interface DrivingAudioFrame {
  /** Whether a movement key is held this frame. */
  readonly driving: boolean;
  /** Whether the wagon actually covered ground this frame. */
  readonly rolling: boolean;
  /** Monotonic frame counter, for the bump rate limit. */
  readonly frameNo: number;
  /** Terrain under the wagon this frame. */
  readonly terrainId: string | undefined;
}

export interface DrivingAudioResult {
  readonly cues: readonly DrivingCue[];
  readonly memory: DrivingAudioMemory;
}

/** Roads and bridges are the paved ground the road cues are about. */
function isPaved(terrainId: string | undefined): boolean {
  return terrainId === 'road' || terrainId === 'bridge';
}

/** One cue for a terrain crossing, or none when the change is unremarkable. */
function crossingCues(from: string | undefined, to: string | undefined): DrivingCue[] {
  const cues: DrivingCue[] = [];
  if (isPaved(to) && !isPaved(from)) {
    cues.push('road-joined');
  } else if (isPaved(from) && !isPaved(to)) {
    cues.push('road-left');
  }
  // Gated ground is the terrain the base wagon could not enter at all, so
  // reaching it means a capability opened it. Read off the unlock id rather
  // than the terrain id so a new region's ford needs no change here.
  const unlockId = to === undefined ? undefined : getTerrain(to)?.unlockId;
  if (unlockId === 'mire-crossing' || unlockId === 'tidal-crossing') {
    cues.push('gated-ground');
  } else if (unlockId !== undefined) {
    cues.push('ford-crossed');
  }
  return cues;
}

/**
 * Decide which driving cues this frame earns, and what to remember for the next
 * one. Both the bump and the crossing depend on the previous frame, so the
 * caller must feed the returned memory back in.
 */
export function drivingAudioCues(
  frame: DrivingAudioFrame,
  memory: DrivingAudioMemory,
): DrivingAudioResult {
  const cues: DrivingCue[] = [];

  // Movement that actually happened, not movement that was asked for. Pressed
  // into a mountain these disagree, and that disagreement is the bump.
  const blocked = frame.driving && memory.wasDriving && !frame.rolling;
  const bumping = blocked && frame.frameNo >= memory.bumpReadyFrame;
  if (bumping) {
    cues.push('bump');
  }

  if (memory.prevTerrainKnown && frame.terrainId !== memory.prevTerrainId) {
    cues.push(...crossingCues(memory.prevTerrainId, frame.terrainId));
  }

  return {
    cues,
    memory: {
      wasDriving: frame.driving,
      bumpReadyFrame: bumping ? frame.frameNo + BUMP_COOLDOWN_FRAMES : memory.bumpReadyFrame,
      prevTerrainId: frame.terrainId,
      prevTerrainKnown: true,
    },
  };
}
