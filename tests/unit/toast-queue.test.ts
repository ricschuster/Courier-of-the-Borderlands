import { describe, it, expect } from 'vitest';
import {
  EMPTY_TOAST_QUEUE,
  TOAST_GROUP_MAX,
  clearToastQueue,
  dismissCurrentToast,
  enqueueToast,
  pendingToastCount,
  shownToastCount,
  toastBody,
  toastDismissHint,
  type ToastQueue,
} from '../../src/systems/toast-queue';

/**
 * Build a queue by enqueuing each message, all in the same burst. This is the
 * arrival case: everything raised in one update() frame.
 */
function burst(...messages: readonly string[]): ToastQueue {
  return messages.reduce((q, m) => enqueueToast(q, m, 1), EMPTY_TOAST_QUEUE);
}

/** Build a queue by enqueuing each message in its own burst (one per frame). */
function separate(...messages: readonly string[]): ToastQueue {
  return messages.reduce((q, m, i) => enqueueToast(q, m, i + 1), EMPTY_TOAST_QUEUE);
}

describe('enqueueToast', () => {
  it('shows the first message immediately', () => {
    expect(burst('a').shown).toEqual(['a']);
  });

  it('groups messages from the same burst into one panel', () => {
    // The #378 case: a delivery raises its reward line, an achievement, and the
    // settlement note in one frame. All three are on screen together.
    expect(burst('a', 'b', 'c').shown).toEqual(['a', 'b', 'c']);
    expect(pendingToastCount(burst('a', 'b', 'c'))).toBe(0);
  });

  it('caps a group at TOAST_GROUP_MAX and queues the overflow', () => {
    const queue = burst('a', 'b', 'c', 'd');
    expect(queue.shown).toHaveLength(TOAST_GROUP_MAX);
    expect(pendingToastCount(queue)).toBe(1);
  });

  it('makes a later burst wait rather than joining the panel being read', () => {
    // The core of #327 survives: a message raised seconds later must not appear
    // inside a panel the player is already part-way through reading.
    const queue = separate('a', 'b');
    expect(queue.shown).toEqual(['a']);
    expect(pendingToastCount(queue)).toBe(1);
  });

  it('keeps arrival order across bursts', () => {
    expect(separate('a', 'b', 'c').pending.map((t) => t.message)).toEqual(['b', 'c']);
  });

  it('drops a repeat of a message already on screen', () => {
    // The blocked-ford hint fires once per approach; standing at the ford must
    // not charge the player a press per approach.
    expect(burst('a', 'a').shown).toEqual(['a']);
  });

  it('drops a repeat of a message already waiting', () => {
    const queue = separate('a', 'b');
    expect(enqueueToast(queue, 'b', 9)).toEqual(queue);
  });

  it('drops a repeat raised in a later burst, not just the same one', () => {
    // Suppression is about unread duplicates, so it must not be defeated by the
    // frame simply having moved on: the re-firing warnings do exactly that.
    const queue = burst('a');
    expect(enqueueToast(queue, 'a', 2)).toEqual(queue);
  });

  it('allows a message to be queued again once it has been dismissed', () => {
    // Suppression is about unread duplicates, not about muting a line forever:
    // a second genuine repair later in the run should still be announced.
    const afterFirst = dismissCurrentToast(burst('repaired'));
    expect(enqueueToast(afterFirst, 'repaired', 2).shown).toEqual(['repaired']);
  });

  it('does not mutate the queue it is given', () => {
    const before = burst('a');
    enqueueToast(before, 'b', 2);
    expect(before.shown).toEqual(['a']);
    expect(before.pending).toEqual([]);
  });
});

describe('dismissCurrentToast', () => {
  it('clears the whole group on screen in one press', () => {
    // This is what #378 buys: the arrival burst costs one press, not three.
    expect(dismissCurrentToast(burst('a', 'b', 'c'))).toEqual(EMPTY_TOAST_QUEUE);
  });

  it('promotes the next message rather than clearing the queue', () => {
    const queue = dismissCurrentToast(separate('a', 'b', 'c'));
    expect(queue.shown).toEqual(['b']);
    expect(pendingToastCount(queue)).toBe(1);
  });

  it('promotes a whole waiting burst together', () => {
    // Two bursts: 'a' alone, then 'b' and 'c' raised in one frame behind it. One
    // press moves past 'a', and 'b'/'c' arrive as a single panel.
    let queue = enqueueToast(EMPTY_TOAST_QUEUE, 'a', 1);
    queue = enqueueToast(queue, 'b', 2);
    queue = enqueueToast(queue, 'c', 2);
    expect(queue.shown).toEqual(['a']);
    const after = dismissCurrentToast(queue);
    expect(after.shown).toEqual(['b', 'c']);
    expect(pendingToastCount(after)).toBe(0);
  });

  it('does not promote across a burst boundary', () => {
    // The promoted group must stop where the burst stops, or a later message
    // would be pulled onto the screen with messages it never arrived with.
    let queue = enqueueToast(EMPTY_TOAST_QUEUE, 'a', 1);
    queue = enqueueToast(queue, 'b', 2);
    queue = enqueueToast(queue, 'c', 3);
    const after = dismissCurrentToast(queue);
    expect(after.shown).toEqual(['b']);
    expect(after.pending.map((t) => t.message)).toEqual(['c']);
  });

  it('caps a promoted burst at TOAST_GROUP_MAX', () => {
    // A four-message burst overflows on the way in; the overflow must not then be
    // promoted as an over-sized group.
    const queue = dismissCurrentToast(burst('a', 'b', 'c', 'd'));
    expect(queue.shown).toEqual(['d']);
  });

  it('empties the queue when the last group is dismissed', () => {
    expect(dismissCurrentToast(burst('a'))).toEqual(EMPTY_TOAST_QUEUE);
  });

  it('is a no-op on an empty queue', () => {
    expect(dismissCurrentToast(EMPTY_TOAST_QUEUE)).toEqual(EMPTY_TOAST_QUEUE);
  });

  it('takes one press per burst to clear a queue of separate messages', () => {
    let queue = separate('a', 'b', 'c');
    queue = dismissCurrentToast(queue);
    queue = dismissCurrentToast(queue);
    expect(queue.shown).toEqual(['c']);
    queue = dismissCurrentToast(queue);
    expect(queue).toEqual(EMPTY_TOAST_QUEUE);
  });
});

describe('toastBody', () => {
  it('is null when nothing is showing, so the HUD destroys the text object', () => {
    expect(toastBody(EMPTY_TOAST_QUEUE)).toBeNull();
  });

  it('renders a lone message as itself', () => {
    expect(toastBody(burst('a'))).toBe('a');
  });

  it('separates grouped messages with a blank line', () => {
    // These messages wrap, so without the blank line two of them read as one
    // run-on paragraph.
    expect(toastBody(burst('a', 'b'))).toBe('a\n\nb');
  });
});

describe('clearToastQueue', () => {
  it('drops pending messages as well as the group on screen', () => {
    expect(clearToastQueue()).toEqual(EMPTY_TOAST_QUEUE);
  });
});

describe('shownToastCount', () => {
  it('counts the messages on screen', () => {
    expect(shownToastCount(EMPTY_TOAST_QUEUE)).toBe(0);
    expect(shownToastCount(burst('a'))).toBe(1);
    expect(shownToastCount(burst('a', 'b'))).toBe(2);
  });
});

describe('pendingToastCount', () => {
  it('counts only the messages behind the group on screen', () => {
    expect(pendingToastCount(separate('a', 'b', 'c'))).toBe(2);
    expect(pendingToastCount(burst('a'))).toBe(0);
    expect(pendingToastCount(EMPTY_TOAST_QUEUE)).toBe(0);
  });
});

describe('toastDismissHint', () => {
  it('is absent when no toast is up, so the help line stays quiet', () => {
    expect(toastDismissHint(EMPTY_TOAST_QUEUE)).toBeNull();
  });

  it('cues a plain dismiss for a lone message', () => {
    expect(toastDismissHint(burst('a'))).toBe('Space: dismiss');
  });

  it('cues a plain dismiss for a group, which clears in one press', () => {
    // A grouped burst has nothing behind it, so promising "2 more" would be a lie.
    expect(toastDismissHint(burst('a', 'b'))).toBe('Space: dismiss');
  });

  it('names how many messages are still waiting', () => {
    // Without the count a queue is invisible: the player cannot tell that Space
    // reveals another message rather than returning to a quiet screen.
    expect(toastDismissHint(separate('a', 'b'))).toBe('Space: dismiss (1 more)');
    expect(toastDismissHint(separate('a', 'b', 'c'))).toBe('Space: dismiss (2 more)');
  });

  it('drops back to the plain cue as the queue drains', () => {
    expect(toastDismissHint(dismissCurrentToast(separate('a', 'b')))).toBe('Space: dismiss');
  });
});
