/**
 * Burst-grouped queue for HUD toast messages (#327, regrouped in #378).
 *
 * History matters here, because this surface has now been through three passes
 * that pull in different directions.
 *
 * 1. Toasts faded on a timer that scaled with message length. A playtest
 *    complained they vanished before they could be read, so they were changed to
 *    hold until the player presses Space.
 * 2. The blind run hit the opposite problem: arriving at a settlement could raise
 *    three toasts at once (delivery, settlement note, achievement) which stacked
 *    over the actionable line, and one Space cleared all three, so two were never
 *    read. #327 made them a strict queue: one message on screen, one press each.
 * 3. That queue's press cost was measured at 3 to 5 consecutive presses on a
 *    destination tile, which the 2026-07-25 playtest reported as "I have to click
 *    many times now" (#378).
 *
 * The rule here keeps every guarantee the first two passes bought and drops the
 * press cost of the third. Messages raised in the same burst (same game frame)
 * share one panel and one dismiss press, up to TOAST_GROUP_MAX. Nothing fades on
 * a timer, and nothing is dismissed unread: everything cleared by a press was on
 * screen, laid out as separate lines rather than stacked on top of each other.
 * A message from a later burst waits its turn instead of joining a panel the
 * player is already reading.
 */

/**
 * How many messages share one panel and one dismiss press. Three covers the
 * arrival burst that motivated this (delivery line, settlement note, achievement)
 * without growing the panel far enough down the screen to bury the map.
 */
export const TOAST_GROUP_MAX = 3;

/** A message waiting its turn, tagged with the burst it arrived in. */
interface QueuedToast {
  readonly message: string;
  readonly burst: number;
}

export interface ToastQueue {
  /** Messages on screen now. Raised together, cleared together, one press. */
  readonly shown: readonly string[];
  /** Which burst the shown group belongs to, or null when nothing is showing. */
  readonly shownBurst: number | null;
  /** Messages waiting behind the shown group, in arrival order. */
  readonly pending: readonly QueuedToast[];
}

export const EMPTY_TOAST_QUEUE: ToastQueue = { shown: [], shownBurst: null, pending: [] };

/**
 * Add a message. It joins the group on screen when it belongs to the same burst
 * and that group has room; otherwise it waits behind it.
 *
 * `burst` is a caller-supplied monotonic stamp (the HUD passes the game frame).
 * Grouping by burst rather than by "is there room" is deliberate: a message
 * raised seconds later must not appear inside a panel the player is mid-way
 * through reading.
 *
 * An identical message anywhere in the queue is dropped rather than added again.
 * Several toasts fire on a condition rather than an event (the blocked-ford hint
 * fires once per approach, the low-condition and save-failure warnings can both
 * re-raise), and without this the player would pay a press for each repeat of a
 * line they have already read.
 */
export function enqueueToast(queue: ToastQueue, message: string, burst: number): ToastQueue {
  if (queue.shown.includes(message) || queue.pending.some((t) => t.message === message)) {
    return queue;
  }
  if (queue.shown.length === 0) {
    return { shown: [message], shownBurst: burst, pending: queue.pending };
  }
  if (queue.shownBurst === burst && queue.shown.length < TOAST_GROUP_MAX) {
    return { ...queue, shown: [...queue.shown, message] };
  }
  return { ...queue, pending: [...queue.pending, { message, burst }] };
}

/**
 * Clear the group on screen and promote the next one: the head of the queue plus
 * any messages behind it from the same burst, up to TOAST_GROUP_MAX.
 *
 * One press clears only what was visible, which is what stops a press from wiping
 * messages unread.
 */
export function dismissCurrentToast(queue: ToastQueue): ToastQueue {
  const [first, ...rest] = queue.pending;
  if (first === undefined) {
    return EMPTY_TOAST_QUEUE;
  }
  const group: string[] = [first.message];
  let taken = 0;
  for (const entry of rest) {
    if (entry.burst !== first.burst || group.length >= TOAST_GROUP_MAX) {
      break;
    }
    group.push(entry.message);
    taken += 1;
  }
  return { shown: group, shownBurst: first.burst, pending: rest.slice(taken) };
}

/**
 * Drop everything, including messages never shown. Reserved for the case where
 * the screen is being taken over wholesale (the end-of-arc capstone), not for
 * the dismiss key.
 */
export function clearToastQueue(): ToastQueue {
  return EMPTY_TOAST_QUEUE;
}

/**
 * The text to render, with a blank line between grouped messages, or null when
 * nothing is showing. The blank line is the separator: these messages wrap, and
 * without it two wrapped lines read as one run-on paragraph.
 */
export function toastBody(queue: ToastQueue): string | null {
  return queue.shown.length === 0 ? null : queue.shown.join('\n\n');
}

/** How many messages are on screen now (0 when the queue is empty). */
export function shownToastCount(queue: ToastQueue): number {
  return queue.shown.length;
}

/** How many messages are waiting behind the group on screen. */
export function pendingToastCount(queue: ToastQueue): number {
  return queue.pending.length;
}

/**
 * The dismiss cue for the help line, or null when nothing is showing. The count
 * tells the player that pressing Space reveals more rather than returning to a
 * quiet screen, which is the only way a queue is discoverable.
 */
export function toastDismissHint(queue: ToastQueue): string | null {
  if (queue.shown.length === 0) {
    return null;
  }
  const waiting = queue.pending.length;
  return waiting === 0 ? 'Space: dismiss' : `Space: dismiss (${waiting} more)`;
}
