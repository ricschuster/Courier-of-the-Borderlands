import Phaser from 'phaser';
import { GAME_TITLE, GAME_WIDTH, GAME_HEIGHT, BACKGROUND_COLOR } from '../config/game-config';
import { DIFFICULTIES, difficultyLabel, type Difficulty } from '../systems/wagon-condition';
import { saveDifficulty } from '../systems/save-system';

// One-line pitch for each preset, shown on the picker. Copy lives here (UI text),
// not in the tuning data, so wording can change without touching the profiles.
const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  relaxed: 'Forgiving. The wagon wears slowly and repairs are cheap.',
  standard: 'The intended balance. Rough roads wear the wagon; mind your repairs.',
  demanding: 'Harsh. Wear bites hard and a neglected wagon will strand you.',
};

/**
 * The new-game start screen: pick a difficulty once, then start the run. The
 * choice is locked for that run (#150) - there is no in-run selector - so it is
 * made here, before the map loads. Shown only on a fresh game; a run in progress
 * resumes straight into the map (see BootScene). Selecting persists the choice
 * and hands off to MapScene, which reads it as the run's tuning.
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    const cx = GAME_WIDTH / 2;

    this.add
      .text(cx, 70, GAME_TITLE, { fontFamily: 'monospace', fontSize: '34px', color: '#f2c14e' })
      .setOrigin(0.5, 0);

    this.add
      .text(cx, 124, 'A courier on a fractured frontier, where the roads are unreliable\nand news travels only as fast as you do.', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#cfcac0',
        align: 'center',
        lineSpacing: 4,
      })
      .setOrigin(0.5, 0);

    this.add
      .text(cx, 196, 'Choose your difficulty  (press a number)', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#f2efe4',
      })
      .setOrigin(0.5, 0);

    // One row per preset, numbered in selector order (easiest to hardest).
    DIFFICULTIES.forEach((difficulty, i) => {
      const y = 244 + i * 60;
      this.add
        .text(cx - 300, y, `[${i + 1}] ${difficultyLabel(difficulty)}`, {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#f2d98f',
        })
        .setOrigin(0, 0);
      this.add
        .text(cx - 300, y + 26, DIFFICULTY_BLURB[difficulty], {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#cfcac0',
        })
        .setOrigin(0, 0);
    });

    this.add
      .text(cx, GAME_HEIGHT - 40, 'You can change difficulty only by starting a new game (N).', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8f8a80',
      })
      .setOrigin(0.5, 0);

    // Bind a number key per preset (top-row and numpad both work). On select,
    // persist the choice and start the run; MapScene reads the stored difficulty
    // on create.
    const codes = Phaser.Input.Keyboard.KeyCodes;
    const rowKeys = [codes.ONE, codes.TWO, codes.THREE];
    const numpadKeys = [codes.NUMPAD_ONE, codes.NUMPAD_TWO, codes.NUMPAD_THREE];
    DIFFICULTIES.forEach((difficulty, i) => {
      const row = rowKeys[i];
      const numpad = numpadKeys[i];
      if (row !== undefined) this.input.keyboard?.addKey(row).on('down', () => this.choose(difficulty));
      if (numpad !== undefined)
        this.input.keyboard?.addKey(numpad).on('down', () => this.choose(difficulty));
    });
  }

  private choose(difficulty: Difficulty): void {
    saveDifficulty(difficulty);
    this.scene.start('MapScene');
  }
}
