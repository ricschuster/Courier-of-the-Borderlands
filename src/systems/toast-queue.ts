/**
 * One-at-a-time queue for HUD toast messages (#327).
 *
 * History matters here. Toasts originally faded on a timer that scaled with
 * message length, and a playtest complained they vanished before they could be
 * read, so they were changed to hold until the player presses Space. The blind
 * run then hit the opposite problem: arriving at a settlement could raise three
 * toasts at once (delivery, settlement note, achievement) which stacked over the
 * actionable line, and one Space cleared all three, so two were never read.
 *
 * The queue keeps the hold (no timers anywhere) and fixes both halves: only one
 * message is on screen at a time, and each one costs its own press, so nothing
 * is dismissed unread.
 */
export interface ToastQueue {
  /** The message on screen, or null when nothing is showing. */
  readonly current: string | null;
  /** Messages waiting behind the current one, in arrival order. */
  readonly pending: readonly string[];
}

export const EMPTY_TOAST_QUEUE: ToastQueue = { current: null, pending: [] };

/**
 * Add a message to the back of the queue, or show it immediately when nothing
 * is up.
 *
 * An identical message already in the queue is dropped rather than queued
 * again. Several toasts re-fire on a condition rather than an event (the
 * blocked-ford hint fires once per approach, the low-condition warning and the
 * save-failure warning can both re-raise), and without this the player would
 * pay a press for each repeat of a line they have already read.
 */
export function enqueueToast(queue: ToastQueue, message: string): ToastQueue {
  if (queue.current === message || queue.pending.includes(message)) {
    return queue;
  }
  if (queue.current === null) {
    return { current: message, pending: [] };
  }
  return { current: queue.current, pending: [...queue.pending, message] };
}

/**
 * Dismiss the message on screen and promote the next one. One press, one
 * message: this is what stops a single Space from wiping messages unread.
 */
export function dismissCurrentToast(queue: ToastQueue): ToastQueue {
  const [next, ...rest] = queue.pending;
  return { current: next ?? null, pending: rest };
}

/**
 * Drop everything, including messages never shown. Reserved for the case where
 * the screen is being taken over wholesale (the end-of-arc capstone), not for
 * the dismiss key.
 */
export function clearToastQueue(): ToastQueue {
  return EMPTY_TOAST_QUEUE;
}

/** How many messages are waiting behind the one on screen. */
export function pendingToastCount(queue: ToastQueue): number {
  return queue.pending.length;
}

/**
 * The dismiss cue for the help line, or null when no toast is up. The count
 * tells the player that pressing Space reveals another message rather than
 * returning to a quiet screen, which is the only way a queue is discoverable.
 */
export function toastDismissHint(queue: ToastQueue): string | null {
  if (queue.current === null) {
    return null;
  }
  const waiting = queue.pending.length;
  return waiting === 0 ? 'Space: dismiss' : `Space: dismiss (${waiting} more)`;
}
