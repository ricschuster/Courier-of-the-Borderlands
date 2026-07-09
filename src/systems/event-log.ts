// A small in-session ring of the most recent notable messages, so story text
// (deliveries, contracts, encounters, arrivals) can be re-read in the journal
// after its toast has faded. This is the recall surface the Session 2 playtest
// asked for (text vanished too fast; see docs/design/05_playtest_notes.md).
//
// In-session only: it is not saved. The messages mirror the transient toasts,
// and rebuilding them on load would need a message history the game does not
// persist, so a fresh run starts with an empty log.

export const MAX_RECENT_EVENTS = 6;

/**
 * Append a message to the log, returning a new list capped to the newest `max`
 * entries (oldest dropped). Newest is last. Pure, so it is unit tested.
 */
export function pushEvent(
  log: readonly string[],
  message: string,
  max = MAX_RECENT_EVENTS,
): string[] {
  const next = [...log, message];
  return next.length > max ? next.slice(next.length - max) : next;
}
