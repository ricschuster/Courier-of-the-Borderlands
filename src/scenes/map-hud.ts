import Phaser from 'phaser';
import { GAME_TITLE, GAME_WIDTH, GAME_HEIGHT } from '../config/game-config';
import { TERRAIN_TYPES } from '../data/terrain-types';
import { buildLegend } from '../systems/legend';
import type { SettlementStatus } from '../systems/world-state';
import type { MinimapModel } from '../systems/minimap';
import type { PathResult } from '../systems/pathfinding';

// Depth layer for every HUD and overlay object: always drawn on top of the
// map, markers, and fog.
export const DEPTH_HUD = 10;

// Settlement marker fill by connection status: silent places read as dim and
// dark, reconnected places glow warm, home stays pale. This is the visible
// payoff of a delivery (see docs/design/05_playtest_notes.md). Shared with the
// scene, which colours the main-map settlement markers with the same table.
export const STATUS_COLOR: Readonly<Record<SettlementStatus, number>> = {
  home: 0xf2efe4,
  reconnected: 0xf2c14e,
  silent: 0x6b6660,
};

// Semi-transparent dark backing for HUD text so it stays legible over any
// terrain once fog is cleared (the help line washed out over light tiles; see
// docs/design/05_playtest_notes.md).
const HUD_BG = 'rgba(11, 11, 11, 0.66)';
const HUD_PAD = { x: 4, y: 1 } as const;

// Minimap layout. Cells are MINIMAP_CELL pixels per tile, but shrink so the
// whole minimap fits inside a MINIMAP_MAX_PX box on large maps that would
// otherwise overflow the corner.
const MINIMAP_CELL = 6;
const MINIMAP_MAX_PX = 192;

/** Wallet line inputs, assembled into the top status line by the HUD. */
export interface WalletView {
  readonly coins: number;
  readonly reputation: number;
  readonly tierName: string;
  readonly level: number;
  readonly skillPoints: number;
}

/** A conversation node to render: who is speaking, what they say, and the choices. */
export interface DialogueView {
  readonly speaker: string;
  readonly text: string;
  /** Choice labels in order; the HUD numbers them and the scene maps a number back. */
  readonly choices: readonly string[];
}

/**
 * Owns every HUD and overlay GameObject for MapScene: the status lines, the
 * contract board, the toggled panels (journal, skills, legend, minimap), the
 * run-summary panel, and transient toasts. The scene keeps the game state and
 * decides what to show; this class is the presentation layer and the single
 * home for new panels such as the coming dialogue UI.
 *
 * A fresh instance is built each time the scene is created, because Phaser
 * destroys all GameObjects on scene restart.
 */
export class MapHud {
  private readonly scene: Phaser.Scene;

  private readonly wallet: Phaser.GameObjects.Text;
  private readonly objective: Phaser.GameObjects.Text;
  private readonly terrainReadout: Phaser.GameObjects.Text;
  private readonly fordStatus: Phaser.GameObjects.Text;
  private readonly weatherLine: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly board: Phaser.GameObjects.Text;
  private readonly journalPanel: Phaser.GameObjects.Text;
  private readonly skillPanel: Phaser.GameObjects.Text;
  private readonly summaryPanel: Phaser.GameObjects.Text;
  private readonly legendPanel: Phaser.GameObjects.Text;
  private readonly dialoguePanel: Phaser.GameObjects.Text;
  private readonly minimapGfx: Phaser.GameObjects.Graphics;
  private minimapVisible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const line = (y: number, color: string): Phaser.GameObjects.Text =>
      scene.add
        .text(8, y, '', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color,
          backgroundColor: HUD_BG,
          padding: HUD_PAD,
        })
        .setScrollFactor(0)
        .setDepth(DEPTH_HUD);

    scene.add
      .text(8, 8, GAME_TITLE, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#e8e8e8',
        backgroundColor: HUD_BG,
        padding: HUD_PAD,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD);
    this.wallet = line(28, '#e8e8e8');
    this.objective = line(46, '#f2d98f');
    this.terrainReadout = line(64, '#e8e8e8');
    this.fordStatus = line(82, '#e8e8e8');
    this.weatherLine = line(100, '#a9c7e8');
    this.hint = scene.add
      .text(8, GAME_HEIGHT - 24, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#d0d0d0',
        backgroundColor: HUD_BG,
        padding: HUD_PAD,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD);

    this.board = scene.add
      .text(8, 118, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#f2efe4',
        backgroundColor: '#0b0b0bcc',
        padding: { x: 10, y: 8 },
        lineSpacing: 4,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD)
      .setVisible(false);

    // Journal panel (toggled with J), centred near the top.
    this.journalPanel = this.centeredPanel();
    // Skills panel (toggled with K), centred near the top.
    this.skillPanel = this.centeredPanel();

    // Run summary panel, shown when the region is cleared.
    this.summaryPanel = scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#f2efe4',
        backgroundColor: '#0b0b0bee',
        padding: { x: 16, y: 14 },
        lineSpacing: 6,
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD)
      .setVisible(false);

    // Minimap graphics (toggled with M), drawn in drawMinimap.
    this.minimapGfx = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH_HUD).setVisible(false);

    // Terrain codex (toggled with L); static content from terrain data.
    const legend = buildLegend(Object.values(TERRAIN_TYPES));
    const legendLines = ['TERRAIN CODEX   (L to close)'];
    for (const entry of legend) {
      legendLines.push(`  ${entry.name}: ${entry.speedLabel}${entry.passable ? '' : ' (impassable)'}`);
    }
    this.legendPanel = scene.add
      .text(GAME_WIDTH - 8, 40, legendLines.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#f2efe4',
        backgroundColor: '#0b0b0bdd',
        padding: { x: 12, y: 10 },
        lineSpacing: 4,
        align: 'left',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD)
      .setVisible(false);

    // Dialogue box (opened with E at a settlement), anchored bottom-centre so
    // it reads like a conversation panel. Movement is frozen while it is open.
    this.dialoguePanel = scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 36, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#f2efe4',
        backgroundColor: '#0b0b0bee',
        padding: { x: 14, y: 12 },
        lineSpacing: 5,
        align: 'left',
        wordWrap: { width: GAME_WIDTH - 120 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD)
      .setVisible(false);
  }

  /** A left-aligned dark panel centred near the top, used for the toggled overlays. */
  private centeredPanel(): Phaser.GameObjects.Text {
    return this.scene.add
      .text(GAME_WIDTH / 2, 40, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#f2efe4',
        backgroundColor: '#0b0b0bdd',
        padding: { x: 12, y: 10 },
        lineSpacing: 4,
        align: 'left',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD)
      .setVisible(false);
  }

  // --- One-line status setters ------------------------------------------

  setWallet(view: WalletView): void {
    const pointsNote = view.skillPoints > 0 ? `   Skill points: ${view.skillPoints} (K)` : '';
    this.wallet.setText(
      `Coins: ${view.coins}   Rep: ${view.reputation} (${view.tierName})   Lv ${view.level}${pointsNote}`,
    );
  }

  setObjective(text: string): void {
    this.objective.setText(text);
  }

  setTerrain(text: string): void {
    this.terrainReadout.setText(text);
  }

  setWeather(text: string): void {
    this.weatherLine.setText(text);
  }

  setHint(text: string): void {
    this.hint.setText(text);
  }

  /** Ford status line: null when the region has no ford, else open/locked with colour. */
  setFordStatus(open: boolean | null): void {
    if (open === null) {
      this.fordStatus.setText('');
      return;
    }
    this.fordStatus.setText(`Ford: ${open ? 'OPEN' : 'locked'}`);
    this.fordStatus.setColor(open ? '#8fd18f' : '#d18f8f');
  }

  // --- Panels -----------------------------------------------------------

  /** Show the contract board with the given text, or hide it when text is null. */
  setBoard(text: string | null): void {
    if (text === null) {
      this.board.setVisible(false);
      return;
    }
    this.board.setText(text).setVisible(true);
  }

  setJournalText(text: string): void {
    this.journalPanel.setText(text);
  }

  setSkillText(text: string): void {
    this.skillPanel.setText(text);
  }

  /** Show the run-summary panel with the given text, or hide it when null. */
  setSummary(text: string | null): void {
    if (text === null) {
      this.summaryPanel.setVisible(false);
      return;
    }
    this.summaryPanel.setText(text).setVisible(true);
  }

  /** Show a conversation node, or hide the dialogue box when view is null. */
  setDialogue(view: DialogueView | null): void {
    if (view === null) {
      this.dialoguePanel.setVisible(false);
      return;
    }
    const lines = [view.speaker.toUpperCase(), '', view.text, ''];
    view.choices.forEach((label, i) => {
      lines.push(`  [${i + 1}] ${label}`);
    });
    lines.push('', 'Press a number to choose. Esc to step away.');
    this.dialoguePanel.setText(lines.join('\n')).setVisible(true);
  }

  isDialogueVisible(): boolean {
    return this.dialoguePanel.visible;
  }

  isJournalVisible(): boolean {
    return this.journalPanel.visible;
  }

  isSkillPanelVisible(): boolean {
    return this.skillPanel.visible;
  }

  isMinimapVisible(): boolean {
    return this.minimapVisible;
  }

  /** Toggle the journal; returns the new visibility so the scene can refresh on open. */
  toggleJournal(): boolean {
    const show = !this.journalPanel.visible;
    this.journalPanel.setVisible(show);
    return show;
  }

  /** Toggle the skills panel; returns the new visibility so the scene can refresh on open. */
  toggleSkills(): boolean {
    const show = !this.skillPanel.visible;
    this.skillPanel.setVisible(show);
    return show;
  }

  toggleLegend(): void {
    this.legendPanel.setVisible(!this.legendPanel.visible);
  }

  /** Toggle the minimap; returns the new visibility so the scene can redraw on open. */
  toggleMinimap(): boolean {
    this.minimapVisible = !this.minimapVisible;
    this.minimapGfx.setVisible(this.minimapVisible);
    return this.minimapVisible;
  }

  // --- Minimap rendering ------------------------------------------------

  /** Draw the minimap from a prebuilt model, overlaying the active route if any. */
  drawMinimap(model: MinimapModel, path: PathResult | null): void {
    // Shrink the per-tile cell so a large map's minimap fits the corner box;
    // small maps keep the full MINIMAP_CELL size and look unchanged.
    const cell = Math.max(
      1,
      Math.min(
        MINIMAP_CELL,
        Math.floor(Math.min(MINIMAP_MAX_PX / model.width, MINIMAP_MAX_PX / model.height)),
      ),
    );
    const originX = GAME_WIDTH - model.width * cell - 12;
    const originY = GAME_HEIGHT - model.height * cell - 12;

    const g = this.minimapGfx;
    g.clear();
    g.fillStyle(0x0b0b0b, 0.85);
    g.fillRect(originX - 4, originY - 4, model.width * cell + 8, model.height * cell + 8);

    for (let i = 0; i < model.cells.length; i++) {
      const c = model.cells[i];
      if (c === undefined) {
        continue;
      }
      const x = i % model.width;
      const y = Math.floor(i / model.width);
      const px = originX + x * cell;
      const py = originY + y * cell;
      const fill = c.revealed ? (c.color ?? 0x5a8f4a) : 0x1c1c1c;
      g.fillStyle(fill, 1);
      g.fillRect(px, py, cell - 1, cell - 1);
      if (c.marker === 'settlement') {
        g.fillStyle(STATUS_COLOR[c.settlementStatus ?? 'silent'], 1);
        g.fillRect(px + 1, py + 1, cell - 3, cell - 3);
      } else if (c.marker === 'courier') {
        g.fillStyle(0xf2c14e, 1);
        g.fillRect(px, py, cell - 1, cell - 1);
      }
    }

    // Overlay the route to the active destination on the intermediate tiles.
    if (path !== null && path.reachable && path.path.length > 2) {
      g.fillStyle(0x6fd0e0, 0.9);
      for (let k = 1; k < path.path.length - 1; k++) {
        const node = path.path[k];
        if (node === undefined) {
          continue;
        }
        g.fillRect(originX + node.x * cell + 2, originY + node.y * cell + 2, cell - 4, cell - 4);
      }
    }
  }

  // --- Toast ------------------------------------------------------------

  /** Transient centred message that fades after a few seconds. */
  showToast(message: string, y = 60): void {
    const toast = this.scene.add
      .text(GAME_WIDTH / 2, y, message, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 8, y: 4 },
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 80 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD);
    this.scene.time.delayedCall(3500, () => toast.destroy());
  }
}
