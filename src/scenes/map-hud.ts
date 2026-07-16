import Phaser from 'phaser';
import {
  GAME_TITLE,
  GAME_WIDTH,
  GAME_HEIGHT,
  UI_BAR_TEXTURE_KEY,
  UI_BAR_CAP,
  UI_BAR_FRAME_TRACK,
  UI_BAR_FRAME_GREEN,
  UI_BAR_FRAME_AMBER,
  UI_BAR_FRAME_RED,
} from '../config/game-config';
import { buildLegend, type LegendTerrain } from '../systems/legend';
import type { SettlementStatus } from '../systems/world-state';
import type { MinimapModel } from '../systems/minimap';
import type { PathResult } from '../systems/pathfinding';
import { ScrollablePanel } from './scrollable-panel';
import { FramedPanel } from './framed-panel';

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
// docs/design/05_playtest_notes.md). The contextual hint line keeps its own
// per-line box; the top-left status rows share one framed panel instead (below).
const HUD_BG = 'rgba(11, 11, 11, 0.66)';
const HUD_PAD = { x: 4, y: 1 } as const;

// Unified top-left status panel. The status used to be a stack of independently
// boxed lines that read as scatter and jumped whenever the ford or skill-point
// line appeared (2026-07-12 playtest, docs/design/08_ui_and_onboarding.md). The
// rows now sit at fixed y-slots on one shared backing panel so nothing moves.
// STATUS_ROW_Y reserves two line-heights for the objective (it can wrap to a
// second line) so the rows below never shift.
const STATUS_PANEL = { x: 6, y: 6, w: 452, h: 146 } as const;
const STATUS_ROW_Y = {
  title: 12,
  wallet: 34,
  objective: 56,
  terrain: 94,
  ford: 114,
  weather: 132,
} as const;
// Objective can be long (contract + pickup + destination); wrap it within the
// panel rather than let it run off the right edge.
const STATUS_WRAP_W = STATUS_PANEL.w - 16;

// Wagon-condition meter (#203). It shares the terrain row: the terrain label
// ends by ~x=203, so a compact group sits in the free right portion. "Wagon"
// label, then a Kenney bar (track + coloured fill), then the numeric n/n. The
// 3-slice bar's height is fixed to the 18px source frame, so it is nudged up 3px
// so its centre lines up with the 12px text and it still clears the ford row
// (terrain y=94, ford y=114). Fill colour is the condition cue: green healthy,
// amber low, red stranded (replacing the old #182 line-colour cue).
const WAGON_LABEL_X = 214;
const WAGON_BAR_X = 262;
const WAGON_BAR_Y = STATUS_ROW_Y.terrain - 3;
const WAGON_BAR_W = 84;
const WAGON_NUM_X = WAGON_BAR_X + WAGON_BAR_W + 6;

/** Wagon-condition band, mapped to the bar's fill colour. */
export type WagonState = 'healthy' | 'low' | 'stranded';

const WAGON_FILL_FRAME: Readonly<Record<WagonState, number>> = {
  healthy: UI_BAR_FRAME_GREEN,
  low: UI_BAR_FRAME_AMBER,
  stranded: UI_BAR_FRAME_RED,
};

// The n/n readout is tinted by band too, so the condition cue survives even when
// the fill is too short to show (stranded at 0 leaves an empty track). These are
// the same warning colours the old #182 status line used.
const WAGON_NUMBER_COLOR: Readonly<Record<WagonState, string>> = {
  healthy: '#e8e8e8',
  low: '#f2c94c',
  stranded: '#e88f8f',
};

// Minimap layout. Cells are MINIMAP_CELL pixels per tile, but shrink so the
// whole minimap fits inside a MINIMAP_MAX_PX box on large maps that would
// otherwise overflow the corner.
const MINIMAP_CELL = 6;
const MINIMAP_MAX_PX = 192;

// Toasts stack downward from TOAST_TOP, just below the top-left status panel, so
// a tall multi-line toast grows into the map rather than up over the status.
// They flow by measured height (TOAST_GAP between them) rather than a fixed slot
// pitch, so a wrapped multi-line toast never overlaps the next one. See
// docs/design/05_playtest_notes.md and docs/design/08_ui_and_onboarding.md.
const TOAST_TOP = 162;
const TOAST_GAP = 8;

/** Wallet line inputs, assembled into the top status line by the HUD. */
export interface WalletView {
  readonly coins: number;
  readonly reputation: number;
  readonly tierName: string;
  readonly level: number;
  readonly skillPoints: number;
  /** Locked run difficulty, shown read-only (chosen at the title screen, #150). */
  readonly difficulty: string;
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
  // Wagon-condition meter (#203): a coloured fill sized to the condition
  // fraction, and the numeric n/n beside it. The "Wagon" label and the track
  // behind the fill are static, so they are added in the constructor but not
  // retained.
  private readonly wagonBarFill: Phaser.GameObjects.NineSlice;
  private readonly wagonNumber: Phaser.GameObjects.Text;
  private readonly board: FramedPanel;
  // Salient unspent-skill-points cue (#174): a bright chip in the free top-right
  // corner, shown only when points are banked, so skills stop being forgotten.
  private readonly skillCue: Phaser.GameObjects.Text;
  private readonly journalPanel: ScrollablePanel;
  private readonly skillPanel: ScrollablePanel;
  private readonly upgradePanel: ScrollablePanel;
  private readonly summaryPanel: FramedPanel;
  private readonly capstonePanel: FramedPanel;
  private readonly legendPanel: FramedPanel;
  private readonly dialoguePanel: FramedPanel;
  private readonly minimapGfx: Phaser.GameObjects.Graphics;
  private minimapVisible = false;
  // Active toasts keyed by slot. They persist until the player dismisses them
  // (no fade timer), so a story or delivery message can be read at any pace.
  private readonly toasts = new Map<number, Phaser.GameObjects.Text>();

  /**
   * @param legendTerrains the terrains this region's map uses, for the codex.
   *   Passed in rather than read from the terrain data directly so the codex
   *   describes the ground the player is actually standing on (#251).
   */
  constructor(scene: Phaser.Scene, legendTerrains: readonly LegendTerrain[]) {
    this.scene = scene;

    // Shared backing panel for the status rows. Drawn first so the row text
    // (added just after, same depth) renders on top of it.
    scene.add
      .rectangle(
        STATUS_PANEL.x,
        STATUS_PANEL.y,
        STATUS_PANEL.w,
        STATUS_PANEL.h,
        0x0b0b0b,
        0.66,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD);

    const line = (y: number, color: string, wrap = false): Phaser.GameObjects.Text =>
      scene.add
        .text(14, y, '', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color,
          ...(wrap ? { wordWrap: { width: STATUS_WRAP_W } } : {}),
        })
        .setScrollFactor(0)
        .setDepth(DEPTH_HUD);

    scene.add
      .text(14, STATUS_ROW_Y.title, GAME_TITLE, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#e8e8e8',
      })
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD);
    this.wallet = line(STATUS_ROW_Y.wallet, '#e8e8e8');
    this.objective = line(STATUS_ROW_Y.objective, '#f2d98f', true);
    this.terrainReadout = line(STATUS_ROW_Y.terrain, '#e8e8e8');
    this.fordStatus = line(STATUS_ROW_Y.ford, '#e8e8e8');
    this.weatherLine = line(STATUS_ROW_Y.weather, '#a9c7e8');

    // Wagon-condition meter on the terrain row. The bar is a horizontal 3-slice
    // (topHeight/bottomHeight 0), so UI_BAR_CAP keeps its end caps crisp while
    // the middle stretches. The fill draws over the track and is resized/tinted
    // each frame by setWagonCondition.
    scene.add
      .text(WAGON_LABEL_X, STATUS_ROW_Y.terrain, 'Wagon', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#e8e8e8',
      })
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD);
    scene.add
      .nineslice(
        WAGON_BAR_X,
        WAGON_BAR_Y,
        UI_BAR_TEXTURE_KEY,
        UI_BAR_FRAME_TRACK,
        WAGON_BAR_W,
        undefined,
        UI_BAR_CAP,
        UI_BAR_CAP,
        0,
        0,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD);
    this.wagonBarFill = scene.add
      .nineslice(
        WAGON_BAR_X,
        WAGON_BAR_Y,
        UI_BAR_TEXTURE_KEY,
        UI_BAR_FRAME_GREEN,
        WAGON_BAR_W,
        undefined,
        UI_BAR_CAP,
        UI_BAR_CAP,
        0,
        0,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD);
    this.wagonNumber = scene.add
      .text(WAGON_NUM_X, STATUS_ROW_Y.terrain, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#e8e8e8',
      })
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD);

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

    this.board = new FramedPanel(scene, {
      x: 8,
      y: STATUS_PANEL.y + STATUS_PANEL.h + 8,
      originX: 0,
      originY: 0,
      depth: DEPTH_HUD,
      style: {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#f2efe4',
        padding: { x: 10, y: 8 },
        lineSpacing: 4,
      },
    });

    // Unspent-skill-points chip: dark text on the warm gold accent (STATUS_COLOR
    // reconnected), so it reads as a call-to-action against the map. Anchored to
    // the free top-right corner (the minimap lives bottom-right). Hidden until
    // points are banked (#174).
    this.skillCue = scene.add
      .text(GAME_WIDTH - 12, 10, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#1b1300',
        backgroundColor: '#f2c14e',
        padding: { x: 8, y: 4 },
        fontStyle: 'bold',
        align: 'right',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD)
      .setVisible(false);

    // Journal panel (toggled with J): a scrollable, screen-filling reference box.
    this.journalPanel = new ScrollablePanel(scene, { depth: DEPTH_HUD, fontSize: '11px' });
    // Skills panel (toggled with K): same scrollable box.
    this.skillPanel = new ScrollablePanel(scene, { depth: DEPTH_HUD, fontSize: '11px' });
    // Upgrade menu (toggled with B at home): same scrollable box.
    this.upgradePanel = new ScrollablePanel(scene, { depth: DEPTH_HUD, fontSize: '11px' });

    // Run summary panel, shown when the region is cleared.
    this.summaryPanel = new FramedPanel(scene, {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
      originX: 0.5,
      originY: 0.5,
      depth: DEPTH_HUD,
      style: {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#f2efe4',
        padding: { x: 16, y: 14 },
        lineSpacing: 6,
        align: 'center',
      },
    });

    // End-of-arc capstone panel, shown once when the blockade is broken. Warm
    // gold title colour so the finale reads as special.
    this.capstonePanel = new FramedPanel(scene, {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
      originX: 0.5,
      originY: 0.5,
      depth: DEPTH_HUD,
      style: {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#f2c14e',
        padding: { x: 22, y: 18 },
        lineSpacing: 7,
        align: 'center',
      },
    });

    // Minimap graphics (toggled with M), drawn in drawMinimap.
    this.minimapGfx = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH_HUD).setVisible(false);

    // Terrain codex (toggled with L). Content is fixed for the scene's lifetime,
    // and a scene restart (travel, new game) rebuilds the HUD, so the codex
    // follows the player into the next region without needing to be refreshed.
    const legend = buildLegend(legendTerrains);
    const legendLines = ['TERRAIN CODEX   (L to close)'];
    for (const entry of legend) {
      legendLines.push(`  ${entry.name}: ${entry.speedLabel}${entry.passable ? '' : ' (impassable)'}`);
    }
    this.legendPanel = new FramedPanel(scene, {
      x: GAME_WIDTH - 8,
      y: 40,
      originX: 1,
      originY: 0,
      depth: DEPTH_HUD,
      style: {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#f2efe4',
        padding: { x: 12, y: 10 },
        lineSpacing: 4,
        align: 'left',
      },
    });
    this.legendPanel.setText(legendLines.join('\n'));

    // Dialogue box (opened with E at a settlement), anchored bottom-centre so
    // it reads like a conversation panel. Movement is frozen while it is open.
    this.dialoguePanel = new FramedPanel(scene, {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT - 36,
      originX: 0.5,
      originY: 1,
      depth: DEPTH_HUD,
      style: {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#f2efe4',
        padding: { x: 14, y: 12 },
        lineSpacing: 5,
        align: 'left',
        wordWrap: { width: GAME_WIDTH - 120 },
      },
    });
  }

  // --- One-line status setters ------------------------------------------

  setWallet(view: WalletView): void {
    this.wallet.setText(
      `Coins: ${view.coins}   Rep: ${view.reputation} (${view.tierName})   Lv ${view.level}` +
        `   ${view.difficulty}`,
    );
    // The unspent-points cue moves out of the dense wallet line into its own
    // salient chip so it stops being overlooked (#174).
    const points = view.skillPoints;
    this.skillCue.setVisible(points > 0);
    if (points > 0) {
      const s = points === 1 ? '' : 's';
      const it = points === 1 ? 'it' : 'them';
      this.skillCue.setText(`${points} skill point${s} to spend  -  press K to fit ${it}`);
    }
  }

  setObjective(text: string): void {
    this.objective.setText(text);
  }

  /**
   * Set the terrain status line. Wagon condition now lives in its own meter (see
   * setWagonCondition), so this line is terrain only; the colour arg stays for
   * any future per-terrain cueing but defaults to neutral.
   */
  setTerrain(text: string, color = '#e8e8e8'): void {
    this.terrainReadout.setText(text).setColor(color);
  }

  /**
   * Update the wagon-condition meter: resize the coloured fill to cur/max and
   * tint it by band. The fill colour is the at-a-glance condition cue (#182):
   * green healthy, amber low, red stranded. The numeric n/n is kept beside it for
   * precision.
   */
  setWagonCondition(cur: number, max: number, state: WagonState): void {
    const fraction = max > 0 ? Phaser.Math.Clamp(cur / max, 0, 1) : 0;
    const fillWidth = Math.round(fraction * WAGON_BAR_W);
    if (fillWidth < UI_BAR_CAP) {
      // Below one end-cap's worth the 3-slice cannot render cleanly; an empty bar
      // reads as "spent" on its own, so just hide the fill.
      this.wagonBarFill.setVisible(false);
    } else {
      this.wagonBarFill
        .setVisible(true)
        .setFrame(WAGON_FILL_FRAME[state])
        .setSize(fillWidth, this.wagonBarFill.height);
    }
    this.wagonNumber.setText(`${Math.round(cur)}/${max}`).setColor(WAGON_NUMBER_COLOR[state]);
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
      if (this.board.visible) {
        this.board.setVisible(false);
        // The board just left; re-centre any toast that was sitting beside it.
        this.layoutToasts();
      }
      return;
    }
    this.board.setText(text).setVisible(true);
    // Board width can change with contract count; keep toasts clear of it.
    this.layoutToasts();
  }

  setJournalText(text: string): void {
    this.journalPanel.setText(text);
  }

  setUpgradeText(text: string): void {
    this.upgradePanel.setText(text);
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

  /** Show the end-of-arc capstone panel with the given text, or hide it when null. */
  setCapstone(text: string | null): void {
    if (text === null) {
      this.capstonePanel.setVisible(false);
      return;
    }
    this.capstonePanel.setText(text).setVisible(true);
  }

  isCapstoneVisible(): boolean {
    return this.capstonePanel.visible;
  }

  isBoardVisible(): boolean {
    return this.board.visible;
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

  isSummaryVisible(): boolean {
    return this.summaryPanel.visible;
  }

  isSkillPanelVisible(): boolean {
    return this.skillPanel.visible;
  }

  isMinimapVisible(): boolean {
    return this.minimapVisible;
  }

  isUpgradeMenuVisible(): boolean {
    return this.upgradePanel.visible;
  }

  /**
   * Whether a blocking, screen-filling overlay (journal, skills, codex, or the
   * upgrade menu) is open. The scene uses this to suppress the always-on contract
   * board so only one overlay shows at a time (D1 reserved region, #149): the
   * board no longer shows through the journal when both are open at home.
   */
  isBlockingOverlayOpen(): boolean {
    return (
      this.journalPanel.visible ||
      this.skillPanel.visible ||
      this.legendPanel.visible ||
      this.upgradePanel.visible
    );
  }

  /** Route a mouse-wheel delta to whichever scrollable overlay is currently open. See handleScrollPage for the keyboard route. */
  handleScroll(deltaY: number): void {
    this.scrollablePanel()?.scrollBy(deltaY);
  }

  /**
   * Page whichever scrollable overlay is open (direction 1 down, -1 up), the
   * keyboard equivalent of the wheel. Returns true if a panel took it, so the
   * scene can tell whether the key was consumed. Every other interaction in the
   * game is keyed, so without this the overlays were the one surface that needed
   * a pointer (#274).
   */
  handleScrollPage(direction: number): boolean {
    const panel = this.scrollablePanel();
    panel?.scrollByPage(direction);
    return panel !== null;
  }

  /**
   * Scroll offset of the open scrollable overlay, or null when none is open.
   * Read-only, for the e2e hook: it is the only externally observable proof that
   * a scroll input actually moved the panel (#274).
   */
  scrollOffset(): number | null {
    return this.scrollablePanel()?.scrollOffset ?? null;
  }

  /** The open scrollable overlay, or null. The legend always fits, so it is not one. */
  private scrollablePanel(): ScrollablePanel | null {
    if (this.journalPanel.visible) {
      return this.journalPanel;
    }
    if (this.skillPanel.visible) {
      return this.skillPanel;
    }
    if (this.upgradePanel.visible) {
      return this.upgradePanel;
    }
    return null;
  }

  /** Toggle the journal; returns the new visibility so the scene can refresh on open. */
  toggleJournal(): boolean {
    const show = !this.journalPanel.visible;
    this.journalPanel.setVisible(show);
    this.layoutToasts();
    return show;
  }

  /** Toggle the skills panel; returns the new visibility so the scene can refresh on open. */
  toggleSkills(): boolean {
    const show = !this.skillPanel.visible;
    this.skillPanel.setVisible(show);
    this.layoutToasts();
    return show;
  }

  /** Toggle the terrain codex; returns the new visibility so callers can close siblings. */
  toggleLegend(): boolean {
    const show = !this.legendPanel.visible;
    this.legendPanel.setVisible(show);
    this.layoutToasts();
    return show;
  }

  /** Toggle the upgrade menu; returns the new visibility so the scene can refresh on open. */
  toggleUpgrades(): boolean {
    const show = !this.upgradePanel.visible;
    this.upgradePanel.setVisible(show);
    this.layoutToasts();
    return show;
  }

  /**
   * Hide the mutually exclusive blocking overlays, keeping the named one open.
   * The journal, skills, codex, and upgrade menu all sit centre or side and read
   * badly stacked on top of each other, so only one is shown at a time (the
   * minimap is a non-blocking corner map and is left alone). See
   * docs/design/05_playtest_notes.md.
   */
  closeOverlaysExcept(keep: 'journal' | 'skills' | 'legend' | 'upgrades'): void {
    if (keep !== 'journal') {
      this.journalPanel.setVisible(false);
    }
    if (keep !== 'skills') {
      this.skillPanel.setVisible(false);
    }
    if (keep !== 'legend') {
      this.legendPanel.setVisible(false);
    }
    if (keep !== 'upgrades') {
      this.upgradePanel.setVisible(false);
    }
    // Overlay visibility changed, so re-evaluate whether toasts should hide
    // behind the kept panel or reappear now the others are gone (#170).
    this.layoutToasts();
  }

  /**
   * Close every blocking overlay (journal, skills, codex, upgrade menu). Returns
   * whether any was open, so the scene can consume the Esc key only when it
   * actually closed something and let it fall through to the capstone/summary
   * otherwise. Esc closing every panel is the consistency the dialogue's "Esc to
   * step away" already promises (#319).
   */
  closeBlockingOverlays(): boolean {
    const wasOpen = this.isBlockingOverlayOpen();
    this.journalPanel.setVisible(false);
    this.skillPanel.setVisible(false);
    this.legendPanel.setVisible(false);
    this.upgradePanel.setVisible(false);
    // Overlay visibility changed, so let toasts reappear now the panel is gone.
    this.layoutToasts();
    return wasOpen;
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

  /**
   * Centred message that stays until the player dismisses it (Space), rather
   * than fading on a timer that was always either too short or too long (Session
   * 5 playtest). `slot` stacks simultaneous toasts (0 = first, below the status
   * column; 1, 2 sit under it); a new toast in a slot replaces the old one.
   *
   * Toasts are laid out in a band that clears the contract board: when the board
   * is up (at home) they sit in the free area to its right, otherwise centred.
   * This removes the toast-over-board overlap the D1 pass targets (#149).
   */
  showToast(message: string, slot = 0): void {
    this.toasts.get(slot)?.destroy();
    const toast = this.scene.add
      .text(GAME_WIDTH / 2, TOAST_TOP, message, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 8, y: 4 },
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD);
    this.toasts.set(slot, toast);
    // Lay out every active toast, so a new one at home also nudges any lingering
    // road toast out from over the board.
    this.layoutToasts();
  }

  /** The horizontal band toasts occupy: right of the board when it is up, else centred. */
  private toastBand(): { centerX: number; wrapW: number } {
    const gap = 16;
    if (this.board.visible) {
      const left = this.board.x + this.board.displayWidth + gap;
      const right = GAME_WIDTH - gap;
      return { centerX: (left + right) / 2, wrapW: Math.max(240, right - left) };
    }
    return { centerX: GAME_WIDTH / 2, wrapW: GAME_WIDTH - 80 };
  }

  /**
   * Anchor every active toast to the current band and stack them by measured
   * height (lowest slot on top), so a wrapped multi-line toast never overlaps
   * the next one and none of them overlap the board.
   */
  layoutToasts(): void {
    // A blocking overlay (upgrade menu, journal, skills, codex) fills the centre
    // where toasts also sit, and it hides the board so the side-band dodge does
    // not apply. Rather than fight it, hide the toasts while such a panel is open;
    // they persist undismissed and reappear (via layoutToasts on close) once the
    // panel is shut, so the "clean switch" the D1 pass intends holds here too
    // (#170).
    const hidden = this.isBlockingOverlayOpen();
    const band = this.toastBand();
    let y = TOAST_TOP;
    for (const slot of [...this.toasts.keys()].sort((a, b) => a - b)) {
      const toast = this.toasts.get(slot);
      if (toast === undefined) {
        continue;
      }
      toast.setVisible(!hidden);
      // Set the wrap width first: it re-renders the text and updates height.
      toast.setWordWrapWidth(band.wrapW).setX(band.centerX).setY(y);
      y += toast.height + TOAST_GAP;
    }
  }

  /** Whether any toast is currently on screen, so the scene can show a dismiss cue. */
  hasToasts(): boolean {
    return this.toasts.size > 0;
  }

  /** Clear every visible toast. Called when the player presses the dismiss key. */
  dismissToasts(): void {
    for (const toast of this.toasts.values()) {
      toast.destroy();
    }
    this.toasts.clear();
  }
}
