import { describe, it, expect } from 'vitest';
import {
  EMPTY_TOAST_QUEUE,
  clearToastQueue,
  dismissCurrentToast,
  enqueueToast,
  pendingToastCount,
  toastDismissHint,
  type ToastQueue,
} from '../../src/systems/toast-queue';

/** Build a queue by enqueuing each message in order. */
function queueOf(...messages: readonly string[]): ToastQueue {
  return messages.reduce(enqueueToast, EMPTY_TOAST_QUEUE);
}

describe('enqueueToast', () => {
  it('shows the first message immediately', () => {
    expect(queueOf('a')).toEqual({ current: 'a', pending: [] });
  });

  it('queues later messages behind the current one instead of replacing it', () => {
    // The core of #327: a second arrival message must not overwrite the first
    // one before the player has read it.
    expect(queueOf('a', 'b', 'c')).toEqual({ current: 'a', pending: ['b', 'c'] });
  });

  it('keeps arrival order', () => {
    expect(queueOf('a', 'b', 'c').pending).toEqual(['b', 'c']);
  });

  it('drops a repeat of the message already on screen', () => {
    // The blocked-ford hint fires once per approach; standing at the ford must
    // not charge the player a press per approach.
    expect(queueOf('a', 'a')).toEqual({ current: 'a', pending: [] });
  });

  it('drops a repeat of a message already waiting', () => {
    expect(queueOf('a', 'b', 'b')).toEqual({ current: 'a', pending: ['b'] });
  });

  it('allows a message to be queued again once it has been dismissed', () => {
    // Suppression is about unread duplicates, not about muting a line forever:
    // a second genuine repair later in the run should still be announced.
    const afterFirst = dismissCurrentToast(queueOf('repaired'));
    expect(enqueueToast(afterFirst, 'repaired')).toEqual({ current: 'repaired', pending: [] });
  });

  it('does not mutate the queue it is given', () => {
    const before = queueOf('a');
    enqueueToast(before, 'b');
    expect(before).toEqual({ current: 'a', pending: [] });
  });
});

describe('dismissCurrentToast', () => {
  it('promotes the next message rather than clearing the queue', () => {
    // The behaviour the whole change exists for: one press, one message.
    expect(dismissCurrentToast(queueOf('a', 'b', 'c'))).toEqual({
      current: 'b',
      pending: ['c'],
    });
  });

  it('empties the queue when the last message is dismissed', () => {
    expect(dismissCurrentToast(queueOf('a'))).toEqual(EMPTY_TOAST_QUEUE);
  });

  it('is a no-op on an empty queue', () => {
    expect(dismissCurrentToast(EMPTY_TOAST_QUEUE)).toEqual(EMPTY_TOAST_QUEUE);
  });

  it('takes one press per message to clear a full queue', () => {
    let queue = queueOf('a', 'b', 'c');
    queue = dismissCurrentToast(queue);
    queue = dismissCurrentToast(queue);
    expect(queue.current).toBe('c');
    queue = dismissCurrentToast(queue);
    expect(queue).toEqual(EMPTY_TOAST_QUEUE);
  });
});

describe('clearToastQueue', () => {
  it('drops pending messages as well as the current one', () => {
    expect(clearToastQueue()).toEqual(EMPTY_TOAST_QUEUE);
  });
});

describe('pendingToastCount', () => {
  it('counts only the messages behind the current one', () => {
    expect(pendingToastCount(queueOf('a', 'b', 'c'))).toBe(2);
    expect(pendingToastCount(queueOf('a'))).toBe(0);
    expect(pendingToastCount(EMPTY_TOAST_QUEUE)).toBe(0);
  });
});

describe('toastDismissHint', () => {
  it('is absent when no toast is up, so the help line stays quiet', () => {
    expect(toastDismissHint(EMPTY_TOAST_QUEUE)).toBeNull();
  });

  it('cues a plain dismiss for a lone message', () => {
    expect(toastDismissHint(queueOf('a'))).toBe('Space: dismiss');
  });

  it('names how many messages are still waiting', () => {
    // Without the count a queue is invisible: the player cannot tell that Space
    // reveals another message rather than returning to a quiet screen.
    expect(toastDismissHint(queueOf('a', 'b'))).toBe('Space: dismiss (1 more)');
    expect(toastDismissHint(queueOf('a', 'b', 'c'))).toBe('Space: dismiss (2 more)');
  });

  it('drops back to the plain cue as the queue drains', () => {
    expect(toastDismissHint(dismissCurrentToast(queueOf('a', 'b')))).toBe('Space: dismiss');
  });
});
