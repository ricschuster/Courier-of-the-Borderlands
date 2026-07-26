import { describe, it, expect, beforeEach } from 'vitest';
import {
  BoardInputController,
  type BoardInputHost,
} from '../../src/scenes/board-input-controller';
import type { MapHud } from '../../src/scenes/map-hud';
import type { Audio } from '../../src/scenes/audio';
import { getRegion } from '../../src/systems/region-system';
import type { Contract } from '../../src/systems/contract-system';

// The board's arm/confirm state machine (#321, #376) extracted in #392. The
// browser spec drives the happy path with real key presses; these cover the
// branches it does not reach, and they run deterministically because the
// controller no longer touches the Phaser runtime.

class FakeHud {
  board: string | null = null;
  summaryVisible = false;
  blockingOverlayOpen = false;
  dialogueVisible = false;

  setBoard(text: string | null): void {
    this.board = text;
  }
  isSummaryVisible(): boolean {
    return this.summaryVisible;
  }
  isBlockingOverlayOpen(): boolean {
    return this.blockingOverlayOpen;
  }
  isDialogueVisible(): boolean {
    return this.dialogueVisible;
  }
}

class FakeAudio {
  played: string[] = [];
  panelRefused(): void {
    this.played.push('panel-refused');
  }
  boardArmed(): void {
    this.played.push('board-armed');
  }
}

function contract(id: string, minReputation = 0): Contract {
  return {
    id,
    title: id,
    cargo: 'a letter',
    pickupId: 'greywater',
    destinationId: 'eastwatch',
    reward: 10,
    reputation: 1,
    minReputation,
    note: 'note',
  };
}

describe('BoardInputController', () => {
  let hud: FakeHud;
  let audio: FakeAudio;
  let accepted: Contract[];
  let contracts: Contract[];
  let reputation: number;
  let hasActiveContract: boolean;
  let atHome: boolean;
  let capstoneVisible: boolean;
  /** Which slot index is "just pressed" this frame; null for none. */
  let pressed: number | null;
  let controller: BoardInputController;

  // Nine number keys, matching the scene. Identity is all that matters here.
  const keys = Array.from({ length: 9 }, (_, i) => ({ slot: i })) as never[];

  beforeEach(() => {
    hud = new FakeHud();
    audio = new FakeAudio();
    accepted = [];
    contracts = [contract('letters-to-eastwatch'), contract('grain-to-southmill')];
    reputation = 5;
    hasActiveContract = false;
    atHome = true;
    capstoneVisible = false;
    pressed = null;

    const host: BoardInputHost = {
      getHud: () => hud as unknown as MapHud,
      getAudio: () => audio as unknown as Audio,
      getRegion: () => getRegion('greybridge'),
      getNumberKeys: () => keys,
      justDown: (key) => keys.indexOf(key as never) === pressed,
      boardContracts: () => contracts,
      reputation: () => reputation,
      worldState: () => ({}),
      hasActiveContract: () => hasActiveContract,
      atHome: () => atHome,
      capstoneVisible: () => capstoneVisible,
      acceptContract: (c) => {
        accepted.push(c);
      },
    };
    controller = new BoardInputController(host);
  });

  describe('a mispressed digit cannot commit a journey (#321)', () => {
    it('arms on the first press without accepting', () => {
      pressed = 0;
      controller.handleInput();

      expect(controller.armed()).toBe('letters-to-eastwatch');
      expect(accepted).toEqual([]);
      expect(audio.played).toContain('board-armed');
    });

    it('accepts only on a second press of the same slot', () => {
      pressed = 0;
      controller.handleInput();
      controller.handleInput();

      expect(accepted.map((c) => c.id)).toEqual(['letters-to-eastwatch']);
      expect(controller.armed()).toBeNull();
    });

    it('re-arms rather than accepting when a different slot is pressed second', () => {
      // The whole point of arming: the board renumbers between visits, so the
      // second press landing elsewhere must not commit the first contract.
      pressed = 0;
      controller.handleInput();
      pressed = 1;
      controller.handleInput();

      expect(accepted).toEqual([]);
      expect(controller.armed()).toBe('grain-to-southmill');
    });
  });

  describe('reputation refusals', () => {
    beforeEach(() => {
      contracts = [contract('premium-run', 20)];
      reputation = 5;
    });

    it('refuses in the board rather than accepting or arming', () => {
      pressed = 0;
      controller.handleInput();

      expect(accepted).toEqual([]);
      expect(controller.armed()).toBeNull();
      expect(audio.played).toContain('panel-refused');
      expect(hud.board).toContain('needs 20 reputation');
    });

    it('disarms a previously armed slot', () => {
      contracts = [contract('letters-to-eastwatch'), contract('premium-run', 20)];
      pressed = 0;
      controller.handleInput();
      expect(controller.armed()).toBe('letters-to-eastwatch');

      pressed = 1;
      controller.handleInput();

      expect(controller.armed()).toBeNull();
      expect(accepted).toEqual([]);
    });
  });

  describe('leaving the board disarms it', () => {
    it('clears the armed slot once the board stops being interactable', () => {
      pressed = 0;
      controller.handleInput();
      expect(controller.armed()).toBe('letters-to-eastwatch');

      // Drive away from home; the next frame's input pass drops the arming, so a
      // digit on the next visit arms afresh instead of accepting instantly.
      atHome = false;
      pressed = null;
      controller.handleInput();

      expect(controller.armed()).toBeNull();
    });

    it('is not interactable behind a blocking overlay (#292)', () => {
      hud.blockingOverlayOpen = true;
      expect(controller.interactable()).toBe(false);

      pressed = 0;
      controller.handleInput();
      expect(accepted).toEqual([]);
      expect(controller.armed()).toBeNull();
    });

    it('is not interactable behind the summary or the capstone (#316)', () => {
      hud.summaryVisible = true;
      expect(controller.interactable()).toBe(false);

      hud.summaryVisible = false;
      capstoneVisible = true;
      expect(controller.interactable()).toBe(false);
    });

    it('is not interactable while carrying a contract', () => {
      hasActiveContract = true;
      expect(controller.interactable()).toBe(false);
    });
  });

  describe('drawing', () => {
    it('yields the screen to an open conversation (#181)', () => {
      controller.refresh();
      expect(hud.board).not.toBeNull();

      hud.dialogueVisible = true;
      controller.refresh();

      expect(hud.board).toBeNull();
    });

    it('names the armed slot on the board rather than in a toast (#376)', () => {
      pressed = 0;
      controller.handleInput();

      expect(hud.board).toContain('letters-to-eastwatch');
    });
  });

  describe('reset', () => {
    it('drops an armed slot, because arming belongs to the journey not the run', () => {
      pressed = 0;
      controller.handleInput();
      expect(controller.armed()).toBe('letters-to-eastwatch');

      controller.reset();

      expect(controller.armed()).toBeNull();
    });
  });
});
