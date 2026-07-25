// One cue voice per frame (#383, designed in docs/design/09_audio.md).
//
// With eight cues this did not matter. With thirty it does: a delivery arrival
// already stacks the delivery, an achievement, a settlement note, and sometimes a
// level-up and a reputation tier rise, all inside one update(). Five oscillators
// starting on the same sample is mud, and the loud ones bury the quiet ones
// anyway.
//
// The rule: highest tier wins, the losers are dropped.
//
// Dropped rather than queued, because a cue that arrives late is detached from
// the moment it was describing. A delivery chime 200ms after the delivery toast
// is not a delivery chime, it is a stray noise. This is deliberately the same
// shape as the toast burst grouping (#378): several things happening together get
// one response, not a pile.
//
// The bed is not in here at all. It is a separate continuous voice that is never
// suppressed, because it is describing the ground rather than an event.

import { cueFor, tierRank, type AudioCueId } from './audio-cues';

/**
 * The single gain every voice passes through: the bed and every cue (#383).
 *
 * Two reasons it exists. A continuous bed under thirty cues means loudness creeps
 * up together, and there is no volume control in the game, so headroom has to be
 * taken here or nowhere. And when a slider does arrive, this is the one number it
 * writes to, rather than thirty.
 *
 * Below 1 deliberately: the per-cue gains in audio-cues.ts were tuned in #382
 * against silence, and they now sit on top of a bed that was not there.
 */
export const MASTER_GAIN = 0.9;

/**
 * Pick the one cue that plays from everything requested in a single frame, in
 * request order. Returns null for an empty frame, which is most of them.
 *
 * Ties break on gain and then on request order, so the answer never depends on
 * object iteration or on two cues happening to share a tier: the earlier request
 * wins, because it is the one closer to the thing that caused it.
 */
export function chooseCue(requests: readonly AudioCueId[]): AudioCueId | null {
  let best: AudioCueId | null = null;
  let bestRank = -1;
  let bestGain = -1;
  for (const id of requests) {
    const cue = cueFor(id);
    const rank = tierRank(cue.tier);
    if (rank > bestRank || (rank === bestRank && cue.gain > bestGain)) {
      best = id;
      bestRank = rank;
      bestGain = cue.gain;
    }
  }
  return best;
}
