import Phaser from 'phaser';
import { UI_PANEL_TEXTURE_KEY, UI_PANEL_CORNER } from '../config/game-config';

// A Text panel sitting in a Kenney 9-slice frame (art Phase 2, #203) that
// resizes to fit its text, replacing the old dark backgroundColor on the
// dynamic HUD panels: the dialogue box, run-summary, end-of-arc capstone, and
// terrain codex. Unlike ScrollablePanel (a fixed-size overlay), these panels
// size to their content and are anchored variously (bottom-centre, centre,
// top-right), so the frame is fitted to the text's rendered bounds, which is
// origin-independent.

// Pixels the frame extends beyond the text bounds on each side, so its border
// sits just outside the text's own padding rather than over the glyphs.
const FRAME_INSET = 6;

export interface FramedPanelConfig {
  readonly x: number;
  readonly y: number;
  readonly originX: number;
  readonly originY: number;
  readonly depth: number;
  readonly style: Phaser.Types.GameObjects.Text.TextStyle;
}

export class FramedPanel {
  private readonly text: Phaser.GameObjects.Text;
  private readonly frame: Phaser.GameObjects.NineSlice;

  constructor(scene: Phaser.Scene, config: FramedPanelConfig) {
    // Frame first, then text, so the text draws over the frame at the same depth.
    this.frame = scene.add
      .nineslice(
        config.x,
        config.y,
        UI_PANEL_TEXTURE_KEY,
        undefined,
        16,
        16,
        UI_PANEL_CORNER,
        UI_PANEL_CORNER,
        UI_PANEL_CORNER,
        UI_PANEL_CORNER,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(config.depth)
      .setVisible(false);
    this.text = scene.add
      .text(config.x, config.y, '', config.style)
      .setOrigin(config.originX, config.originY)
      .setScrollFactor(0)
      .setDepth(config.depth)
      .setVisible(false);
  }

  get visible(): boolean {
    return this.text.visible;
  }

  setText(text: string): this {
    this.text.setText(text);
    this.fitFrame();
    return this;
  }

  setVisible(show: boolean): this {
    this.text.setVisible(show);
    this.frame.setVisible(show);
    if (show) {
      this.fitFrame();
    }
    return this;
  }

  // Size and place the frame around the text's rendered bounds. Using bounds
  // (not x/y + origin) keeps a bottom- or centre-anchored panel framed correctly
  // whatever its length.
  private fitFrame(): void {
    const b = this.text.getBounds();
    this.frame.setSize(b.width + FRAME_INSET * 2, b.height + FRAME_INSET * 2);
    this.frame.setPosition(b.x - FRAME_INSET, b.y - FRAME_INSET);
  }
}
