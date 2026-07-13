import Phaser from 'phaser';
import { loadSave } from '../systems/save-system';
import {
  TERRAIN_ATLAS_KEY,
  TERRAIN_ATLAS_FRAME_CONFIG,
} from '../data/terrain-art';
import { MARKER_ATLAS_KEY, MARKER_ATLAS_FRAME_CONFIG } from '../data/marker-art';
import { WAGON_TEXTURE_KEY, UI_PANEL_TEXTURE_KEY } from '../config/game-config';
// Vite resolves these imports to hashed, base-path-aware URLs that work in dev,
// the production build, and GitHub Pages. Typed via vite/client in tsconfig.
import terrainSheetUrl from '../../assets/sprites/roguelike-rpg-sheet.png';
import markerSheetUrl from '../../assets/sprites/tiny-town-sheet.png';
import wagonUrl from '../../assets/sprites/courier-wagon.png';
import uiPanelUrl from '../../assets/sprites/ui-panel-brown.png';

// Boot scene: the entry scene for the game. Later this will preload assets; for
// now it routes to the right first screen.
//
// - A run in progress (a save exists) resumes straight into the map, keeping the
//   difficulty that run was started on.
// - A fresh game goes to the title screen to pick a difficulty, which is then
//   locked for the run (#150).
//
// Exception: under the e2e hook (?e2e) a fresh game skips the title and boots
// straight into the map on the stored/standard difficulty, so the input-driven
// specs reach the map without a picker step. The picker itself is exercised by
// booting with ?e2e&title=1, which forces the title even under the hook.
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  // Load shared textures before routing on. Phaser textures are global, so the
  // terrain atlas loaded here is available to MapScene however it is reached
  // (straight in, or via the title screen).
  preload(): void {
    this.load.spritesheet(TERRAIN_ATLAS_KEY, terrainSheetUrl, TERRAIN_ATLAS_FRAME_CONFIG);
    this.load.spritesheet(MARKER_ATLAS_KEY, markerSheetUrl, MARKER_ATLAS_FRAME_CONFIG);
    this.load.image(WAGON_TEXTURE_KEY, wagonUrl);
    this.load.image(UI_PANEL_TEXTURE_KEY, uiPanelUrl);
  }

  create(): void {
    const params =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const isE2E = params.has('e2e');
    const forceTitle = params.has('title');

    const hasSave = loadSave() !== null;
    const skipTitle = hasSave || (isE2E && !forceTitle);
    this.scene.start(skipTitle ? 'MapScene' : 'TitleScene');
  }
}
