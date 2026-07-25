import { describe, it, expect } from 'vitest';
import {
  modalHintText,
  wagonHintText,
  worldHintText,
  type WorldHintInput,
} from '../../src/systems/hint-text';
import { DEFAULT_WAGON_TUNING, type RepairHelpInput } from '../../src/systems/wagon-condition';

const TUNING = DEFAULT_WAGON_TUNING;

/** A healthy wagon: no repair segment, so a case can isolate the other cues. */
const HEALTHY: RepairHelpInput = {
  atSettlement: false,
  condition: 25,
  max: 25,
  tuning: TUNING,
};

/** On the road, wagon full, nothing pending: the quietest possible line. */
function baseInput(overrides: Partial<WorldHintInput> = {}): WorldHintInput {
  return {
    talkTarget: null,
    wagon: HEALTHY,
    travelTarget: null,
    atHome: false,
    upgradesAvailable: false,
    skillPointsAvailable: false,
    toastHint: null,
    ...overrides,
  };
}

describe('modalHintText', () => {
  // #355: the world hint used to freeze under a modal surface and keep
  // advertising keys the freeze had made inert. Every line here must therefore
  // name only keys that actually work while that surface is up.

  it('names the close keys for a panel', () => {
    expect(modalHintText({ surface: 'journal', scrollable: true, numbersActive: false })).toContain(
      'Esc or J: close',
    );
    expect(modalHintText({ surface: 'skills', scrollable: true, numbersActive: false })).toContain(
      'Esc or K: close',
    );
    expect(modalHintText({ surface: 'codex', scrollable: false, numbersActive: false })).toContain(
      'Esc or L: close',
    );
    expect(modalHintText({ surface: 'upgrades', scrollable: true, numbersActive: false })).toContain(
      'Esc or B: close',
    );
  });

  it('never advertises driving, repair, travel, or the toast dismiss', () => {
    // The exact strings the blind player saw under an open journal while every
    // one of them was inert.
    for (const surface of ['journal', 'skills', 'codex', 'upgrades', 'dialogue'] as const) {
      const text = modalHintText({ surface, scrollable: true, numbersActive: true });
      expect(text).not.toContain('drive');
      expect(text).not.toContain('repair');
      expect(text).not.toContain('travel');
      expect(text).not.toContain('dismiss');
      expect(text).not.toContain('new game');
    }
  });

  // "scrollable" means a panel type that scrolls at all, matching what each
  // panel's own header already advertises; it is not a content-overflow check.
  it('offers the scroll cue only for the scrolling panel types', () => {
    expect(modalHintText({ surface: 'journal', scrollable: true, numbersActive: false })).toContain(
      'PgUp/PgDn: scroll',
    );
    // The codex always fits, so cueing a scroll there would be the same lie in
    // a smaller form.
    expect(
      modalHintText({ surface: 'codex', scrollable: false, numbersActive: false }),
    ).not.toContain('scroll');
  });

  it('offers the number keys only when they would do something', () => {
    expect(modalHintText({ surface: 'skills', scrollable: true, numbersActive: true })).toContain(
      'Number: rank a skill',
    );
    expect(modalHintText({ surface: 'upgrades', scrollable: true, numbersActive: true })).toContain(
      'Number: fit an upgrade',
    );
    // No banked point, or nothing left to fit: the digits are inert, so no cue.
    expect(
      modalHintText({ surface: 'skills', scrollable: true, numbersActive: false }),
    ).not.toContain('Number');
    expect(
      modalHintText({ surface: 'upgrades', scrollable: true, numbersActive: false }),
    ).not.toContain('Number');
  });

  it('keeps the conversation line terse, since the dialogue box states its own keys', () => {
    expect(modalHintText({ surface: 'dialogue', scrollable: false, numbersActive: true })).toBe(
      'Esc: step away',
    );
  });
});

describe('wagonHintText', () => {
  it('says nothing while the wagon is in full repair', () => {
    expect(wagonHintText(HEALTHY)).toBeNull();
    expect(wagonHintText({ ...HEALTHY, atSettlement: true })).toBeNull();
  });

  // #320: a single R can spend most of the purse, so the line has to quote the
  // full-restore price and the per-point rate before the press, not after.
  it('quotes the full repair cost and the rate, not a top-up', () => {
    // 10 points missing at 5c each.
    const text = wagonHintText({ ...HEALTHY, atSettlement: true, condition: 15 });
    expect(text).toBe('R: full repair 50c (5c/pt)');
  });

  it('offers R only at a settlement, but still quotes the price on the road', () => {
    const away = wagonHintText({ ...HEALTHY, condition: 15 });
    expect(away).toBe('full repair 50c at a town (5c/pt)');
    // The plan-ahead case must not imply the key works here.
    expect(away).not.toContain('R:');
  });

  it('offers the rescue price when stranded in the open', () => {
    const text = wagonHintText({ ...HEALTHY, condition: 0 });
    expect(text).toBe(`R: pay ${TUNING.rescueCost}c rescue (or limp to a town)`);
    // The limp is the free exit, so the line has to name it next to the price.
    expect(text).toContain('limp');
  });

  it('offers a repair, not a rescue, when stranded inside a town', () => {
    const text = wagonHintText({ ...HEALTHY, atSettlement: true, condition: 0 });
    expect(text).toBe('R: full repair 125c (5c/pt)');
    expect(text).not.toContain('rescue');
  });

  it('quotes the tuning profile rate rather than a hardcoded one', () => {
    const text = wagonHintText({
      ...HEALTHY,
      atSettlement: true,
      condition: 15,
      tuning: { ...TUNING, costPerPercent: 7 },
    });
    expect(text).toBe('R: full repair 70c (7c/pt)');
  });
});

describe('worldHintText', () => {
  // The line exists because printing every key every frame read as noise
  // (2026-07-12 playtest): only what is actionable here should appear.

  it('always names driving and the new-game key', () => {
    const text = worldHintText(baseInput());
    expect(text).toContain('WASD/arrows drive.');
    expect(text).toContain('N: new game');
  });

  it('stays quiet about everything that is not actionable', () => {
    const text = worldHintText(baseInput({ atHome: true }));
    // At home with nothing to fit, no point banked, no message up, wagon full.
    expect(text).not.toContain('B: upgrades');
    expect(text).not.toContain('K: skills');
    expect(text).not.toContain('repair');
    expect(text).not.toContain('T: travel');
    expect(text).not.toContain('E: talk');
  });

  it('names the settlement it can talk to', () => {
    expect(worldHintText(baseInput({ talkTarget: 'Greybridge' }))).toContain('E: talk to Greybridge');
  });

  it('names the region a gateway leads to', () => {
    expect(worldHintText(baseInput({ travelTarget: 'Fenmarch' }))).toContain('T: travel to Fenmarch');
  });

  it('shows the exploration keys on the road and the shop key at home', () => {
    // At home the board owns the screen, so the reference panels stand down and
    // the upgrade menu is what is worth pointing at.
    const home = worldHintText(baseInput({ atHome: true, upgradesAvailable: true }));
    expect(home).toContain('B: upgrades');
    expect(home).not.toContain('M: map');

    const road = worldHintText(baseInput({ upgradesAvailable: true }));
    expect(road).toContain('M: map');
    expect(road).toContain('J: journal');
    expect(road).toContain('L: codex');
    // The shop is at home; naming B on the road would advertise an inert key.
    expect(road).not.toContain('B: upgrades');
  });

  it('offers the skills key only once a point is banked', () => {
    expect(worldHintText(baseInput({ skillPointsAvailable: true }))).toContain('K: skills');
    expect(worldHintText(baseInput({ skillPointsAvailable: false }))).not.toContain('K: skills');
  });

  // #327: a queued message is invisible, so the caller's cue (which carries the
  // waiting count) is passed through verbatim rather than reworded here.
  it('passes the toast dismiss cue through unchanged', () => {
    expect(worldHintText(baseInput({ toastHint: 'Space: dismiss (2 more)' }))).toContain(
      'Space: dismiss (2 more)',
    );
  });

  it('carries the wagon segment when there is something to spend on', () => {
    const text = worldHintText(
      baseInput({ wagon: { ...HEALTHY, atSettlement: true, condition: 15 } }),
    );
    expect(text).toContain('R: full repair 50c (5c/pt)');
  });

  it('orders the contextual cues between driving and the new-game key', () => {
    const text = worldHintText(
      baseInput({
        talkTarget: 'Greybridge',
        wagon: { ...HEALTHY, atSettlement: true, condition: 15 },
        travelTarget: 'Fenmarch',
        skillPointsAvailable: true,
        toastHint: 'Space: dismiss',
      }),
    );
    const order = [
      'WASD/arrows drive.',
      'E: talk to Greybridge',
      'R: full repair',
      'T: travel to Fenmarch',
      'M: map',
      'K: skills',
      'Space: dismiss',
      'N: new game',
    ].map((segment) => text.indexOf(segment));
    expect(order).not.toContain(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
