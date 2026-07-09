import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game-config';

// A toggled reference overlay (journal, skills) whose content is often taller
// than the screen. Earlier these were a single centred Text with no width or
// height bound, so long lines spilled off the left edge and lower sections
// (Recent events, Places) fell off the bottom. See docs/design/05_playtest_notes.md.
//
// This panel fixes both: an opaque backing box sized to the screen, text wrapped
// to the box width so nothing runs off-side, and a geometry mask clipping the
// text to the box so it can scroll with the mouse wheel.

const PANEL_WIDTH = 680;
const PANEL_TOP = 8;
const PANEL_BOTTOM_MARGIN = 8;
const PANEL_PAD = 12;
// Pixels scrolled per wheel notch; a notch reports ~100 in deltaY.
const WHEEL_STEP = 0.6;

export interface ScrollablePanelOptions {
  readonly depth: number;
  readonly fontSize: string;
}

/**
 * A fixed, opaque, wheel-scrollable overlay panel. Both the backing box and the
 * masked text carry scrollFactor 0 so the pair stays pinned to the camera and
 * the mask tracks the text even when the map camera follows the courier.
 */
export class ScrollablePanel {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly text: Phaser.GameObjects.Text;
  private readonly maskShape: Phaser.GameObjects.Graphics;
  private readonly viewportTop = PANEL_TOP;
  private readonly viewportHeight = GAME_HEIGHT - PANEL_TOP - PANEL_BOTTOM_MARGIN;
  private readonly left = (GAME_WIDTH - PANEL_WIDTH) / 2;
  private offset = 0;

  constructor(scene: Phaser.Scene, opts: ScrollablePanelOptions) {
    this.bg = scene.add
      .rectangle(this.left, this.viewportTop, PANEL_WIDTH, this.viewportHeight, 0x0b0b0b, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x555049)
      .setScrollFactor(0)
      .setDepth(opts.depth)
      .setVisible(false);

    this.text = scene.add
      .text(this.left + PANEL_PAD, this.viewportTop + PANEL_PAD, '', {
        fontFamily: 'monospace',
        fontSize: opts.fontSize,
        color: '#f2efe4',
        lineSpacing: 3,
        align: 'left',
        wordWrap: { width: PANEL_WIDTH - PANEL_PAD * 2 },
      })
      .setScrollFactor(0)
      .setDepth(opts.depth)
      .setVisible(false);

    // A geometry mask clips the text to the viewport box so scrolled-away lines
    // are hidden instead of spilling over the map. scrollFactor 0 keeps the mask
    // aligned with the fixed text as the camera moves.
    this.maskShape = scene.add
      .graphics()
      .setScrollFactor(0)
      .setVisible(false);
    this.maskShape.fillStyle(0xffffff);
    this.maskShape.fillRect(this.left, this.viewportTop, PANEL_WIDTH, this.viewportHeight);
    this.text.setMask(this.maskShape.createGeometryMask());
  }

  get visible(): boolean {
    return this.bg.visible;
  }

  /** Set content and reset scroll to the top, so reopening always starts at the header. */
  setText(text: string): void {
    this.text.setText(text);
    this.offset = 0;
    this.applyOffset();
  }

  setVisible(show: boolean): void {
    this.bg.setVisible(show);
    this.text.setVisible(show);
    if (show) {
      this.offset = 0;
      this.applyOffset();
    }
  }

  /** Scroll by a wheel delta (positive scrolls the content up to reveal lower text). */
  scrollBy(deltaY: number): void {
    this.offset += deltaY * WHEEL_STEP;
    this.applyOffset();
  }

  /** Clamp the offset to the content and position the text within the viewport. */
  private applyOffset(): void {
    const innerHeight = this.viewportHeight - PANEL_PAD * 2;
    const max = Math.max(0, this.text.height - innerHeight);
    this.offset = Phaser.Math.Clamp(this.offset, 0, max);
    this.text.setY(this.viewportTop + PANEL_PAD - this.offset);
  }
}
