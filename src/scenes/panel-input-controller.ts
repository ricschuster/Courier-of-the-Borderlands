// Panel and overlay input, extracted from MapScene (#392): the keys that open,
// close, page, and dismiss a surface rather than the keys that act on the world.
// Mute, the four overlay toggles (minimap, journal, legend, skills), the upgrade
// shop toggle, Esc for a blocking overlay, Esc for the capstone and the summary,
// PgUp/PgDn paging, and Space to advance the toast queue.
//
// These belong together because they share a shape: read a key, change what is on
// screen, and sound the change. None of them touch the wagon, the ledger, or the
// contract state, which is why the host interface below is as narrow as it is.
//
// Behaviour is unchanged from when this lived in MapScene; this is a structural
// extraction, following the DialogueController precedent. The scene delegates
// from update() at both modal early-returns and on the world path.

import Phaser from 'phaser';
import type { MapHud } from './map-hud';
import type { Audio } from './audio';

/** The keys this controller reads. Owned by the scene, which allocates them. */
export interface PanelKeys {
  readonly mute: Phaser.Input.Keyboard.Key;
  readonly buy: Phaser.Input.Keyboard.Key;
  readonly map: Phaser.Input.Keyboard.Key;
  readonly journal: Phaser.Input.Keyboard.Key;
  readonly legend: Phaser.Input.Keyboard.Key;
  readonly skill: Phaser.Input.Keyboard.Key;
  readonly escape: Phaser.Input.Keyboard.Key;
  readonly dismiss: Phaser.Input.Keyboard.Key;
  readonly pageUp: Phaser.Input.Keyboard.Key;
  readonly pageDown: Phaser.Input.Keyboard.Key;
}

/** The services the panel input controller needs from its host scene. */
export interface PanelInputHost {
  getHud(): MapHud;
  getAudio(): Audio;
  getKeys(): PanelKeys;
  /** True when the courier stands at the region's home settlement (gates opening the shop). */
  atHome(): boolean;
  /**
   * Clear the in-panel refusal notice (#356), so a fresh visit to a panel never
   * opens on the complaint left over from the last one.
   */
  clearPanelNotice(): void;
  redrawMinimap(): void;
  refreshJournal(): void;
  refreshSkillPanel(): void;
  refreshUpgradeMenu(): void;
  /** True once the end-of-arc capstone has been dismissed this session. */
  isCapstoneDismissed(): boolean;
  /** Hide the capstone for the rest of the session. */
  dismissCapstone(): void;
  /**
   * True when the region-cleared summary is showing for a region whose panel has
   * not been dismissed yet, so Esc has something to close.
   */
  isSummaryDismissable(): boolean;
  /** Hide this region's summary for the rest of the session. */
  dismissSummary(): void;
}

export class PanelInputController {
  constructor(private readonly host: PanelInputHost) {}

  /**
   * Toggle sound. Called before every modal early-return in update(): a player
   * who wants the room quiet should not have to close a panel or finish a
   * conversation first (#226).
   */
  handleMute(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.host.getKeys().mute)) {
      return;
    }
    const muted = this.host.getAudio().toggleMuted();
    this.host
      .getHud()
      .showToast(muted ? 'Sound off. Press V for sound.' : 'Sound on. Press V to mute.');
  }

  /**
   * B toggles the wagon upgrade menu at home (D3, #161). The old single-key "buy
   * the cheapest" hid the choice and what each upgrade did; now B opens a
   * selectable menu and the actual purchase happens by number key, which stays in
   * the scene with the ledger. Opening is gated to the home shop; closing works
   * anywhere so a menu left open when travel restarts the scene is not sticky.
   */
  handleUpgradeToggle(): void {
    const hud = this.host.getHud();
    if (!Phaser.Input.Keyboard.JustDown(this.host.getKeys().buy)) {
      return;
    }
    if (!hud.isUpgradeMenuVisible() && !this.host.atHome()) {
      return;
    }
    if (hud.toggleUpgrades()) {
      hud.closeOverlaysExcept('upgrades');
      // A fresh visit starts clean rather than on the complaint from last time.
      this.host.clearPanelNotice();
      this.host.refreshUpgradeMenu();
      this.host.getAudio().panelOpened();
    } else {
      this.host.getAudio().panelClosed();
    }
  }

  handleToggles(): void {
    const hud = this.host.getHud();
    const audio = this.host.getAudio();
    const keys = this.host.getKeys();
    // Each toggle is written as a nested if rather than an && so that closing is
    // reachable too: the old form ran the toggle inside the condition and only
    // had a branch for "opened", which left the close half of the pair with
    // nowhere to fire from (#385).
    if (Phaser.Input.Keyboard.JustDown(keys.map)) {
      if (hud.toggleMinimap()) {
        this.host.redrawMinimap();
        audio.panelOpened();
      } else {
        audio.panelClosed();
      }
    }
    // Opening a blocking overlay closes the others, so only one is up at a time.
    if (Phaser.Input.Keyboard.JustDown(keys.journal)) {
      if (hud.toggleJournal()) {
        hud.closeOverlaysExcept('journal');
        this.host.refreshJournal();
        audio.panelOpened();
      } else {
        audio.panelClosed();
      }
    }
    if (Phaser.Input.Keyboard.JustDown(keys.legend)) {
      if (hud.toggleLegend()) {
        hud.closeOverlaysExcept('legend');
        audio.panelOpened();
      } else {
        audio.panelClosed();
      }
    }
    if (Phaser.Input.Keyboard.JustDown(keys.skill)) {
      if (hud.toggleSkills()) {
        hud.closeOverlaysExcept('skills');
        // A fresh visit starts clean rather than on the complaint from last time.
        this.host.clearPanelNotice();
        this.host.refreshSkillPanel();
        audio.panelOpened();
      } else {
        audio.panelClosed();
      }
    }
  }

  /**
   * Close an open blocking overlay (journal, skills, codex, upgrade menu) with
   * Esc, so every panel closes the way the dialogue's "Esc to step away" already
   * teaches, not just with its own toggle key (#319). Runs before the capstone
   * and summary handlers and consumes the key only when a panel was open, so a
   * later Esc still falls through to those end-of-region panels.
   */
  handleOverlayEscape(): void {
    const hud = this.host.getHud();
    if (
      hud.isBlockingOverlayOpen() &&
      Phaser.Input.Keyboard.JustDown(this.host.getKeys().escape)
    ) {
      hud.closeBlockingOverlays();
      this.host.getAudio().panelClosed();
    }
  }

  /** Dismiss the end-of-arc capstone panel with Esc. Takes precedence over the summary. */
  handleCapstone(): void {
    if (
      !this.host.isCapstoneDismissed() &&
      this.host.getHud().isCapstoneVisible() &&
      Phaser.Input.Keyboard.JustDown(this.host.getKeys().escape)
    ) {
      this.host.dismissCapstone();
    }
  }

  /** Dismiss the region-cleared summary panel with Esc so it stops blocking play. */
  handleSummary(): void {
    // Do not also dismiss the summary on the same Esc that closed the capstone;
    // the capstone already suppresses the summary while it is up.
    if (this.host.getHud().isCapstoneVisible()) {
      return;
    }
    if (
      this.host.isSummaryDismissable() &&
      Phaser.Input.Keyboard.JustDown(this.host.getKeys().escape)
    ) {
      this.host.dismissSummary();
    }
  }

  /**
   * Page the open journal, skills, or upgrade overlay with PgUp/PgDn, the keyboard
   * equivalent of the mouse wheel (#274). The arrow keys cannot serve here because
   * movement consumes them.
   */
  handleScroll(): void {
    const keys = this.host.getKeys();
    if (Phaser.Input.Keyboard.JustDown(keys.pageDown)) {
      this.host.getHud().handleScrollPage(1);
    }
    if (Phaser.Input.Keyboard.JustDown(keys.pageUp)) {
      this.host.getHud().handleScrollPage(-1);
    }
  }

  /**
   * Advance the toast queue when the player presses the dismiss key (Space).
   * One press clears one message and reveals the next, so a message queued
   * behind another is never dismissed unread (#327).
   */
  handleDismiss(): void {
    const hud = this.host.getHud();
    if (Phaser.Input.Keyboard.JustDown(this.host.getKeys().dismiss) && hud.hasToasts()) {
      hud.dismissToast();
      // Muting is confirmed by a toast, and dismissing that toast makes no sound
      // for the obvious reason: the game is muted. Unmuting's toast does tick,
      // which is not a contradiction, it is the sound coming back on.
      this.host.getAudio().toastDismissed();
    }
  }
}
