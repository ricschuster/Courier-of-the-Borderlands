// Entry point for Courier of the Borderlands.
// Boots the Phaser game and mounts it into the #game element.
import Phaser from 'phaser';
import { BootScene } from './scenes/boot-scene';
import { TitleScene } from './scenes/title-scene';
import { MapScene } from './scenes/map-scene';
import { GAME_TITLE, GAME_WIDTH, GAME_HEIGHT, BACKGROUND_COLOR } from './config/game-config';
import { clearSave } from './systems/save-system';
import { recordError, type ErrorSource } from './systems/error-log';

// Test-only frame pacing. Phaser's default TimeStep lets a starved frame carry
// up to 200ms of physics (min fps 5), which on a loaded CI runner moves the
// wagon nearly two tiles in one step with stale velocity: it coasts past
// settlement tiles and waypoints, and every exact-tile interaction gate misses.
// With ?e2e, clamp the per-frame delta to 50ms (min fps 20) so worst-case
// movement stays under one tile. Not applied to real play: it would trade
// catch-up for slow-motion under load, which is a feel decision, not a bug fix.
const isE2E =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('e2e');

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  title: GAME_TITLE,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: BACKGROUND_COLOR,
  pixelArt: true,
  ...(isE2E ? { fps: { min: 20 } } : {}),
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, MapScene],
};

function buttonStyle(background: string): string {
  return (
    'display:block;width:100%;margin:8px 0;padding:10px 16px;border:0;border-radius:6px;' +
    `background:${background};color:#fff;font-size:14px;cursor:pointer;`
  );
}

/**
 * Show a recovery overlay when the game hits an uncaught error. A throw during
 * scene creation otherwise leaves a frozen black canvas with no way out, because
 * the in-game reset key lives inside the scene that failed to start. This overlay
 * is plain DOM outside Phaser, so it survives a scene that never ran, and offers
 * a save reset (a corrupt save is the most likely recoverable cause) alongside a
 * plain reload. Idempotent, so repeated errors do not stack overlays.
 */
function showBootError(): void {
  if (typeof document === 'undefined' || document.getElementById('boot-error') !== null) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'boot-error';
  overlay.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'background:#1a1a1a;color:#e8e8e8;font-family:sans-serif;text-align:center;padding:24px;z-index:9999;';

  const box = document.createElement('div');
  box.style.cssText = 'max-width:420px;';

  const heading = document.createElement('h1');
  heading.textContent = 'The road washed out';
  heading.style.cssText = 'font-size:20px;margin:0 0 12px;';

  const body = document.createElement('p');
  body.textContent =
    'Something went wrong and the game could not continue. Resetting your saved game usually fixes it.';
  body.style.cssText = 'font-size:14px;line-height:1.5;margin:0 0 20px;';

  const reset = document.createElement('button');
  reset.textContent = 'Reset save and reload';
  reset.style.cssText = buttonStyle('#3b6ea5');
  reset.addEventListener('click', () => {
    clearSave();
    window.location.reload();
  });

  const reload = document.createElement('button');
  reload.textContent = 'Reload without resetting';
  reload.style.cssText = buttonStyle('#444444');
  reload.addEventListener('click', () => {
    window.location.reload();
  });

  box.append(heading, body, reset, reload);
  overlay.append(box);
  document.body.append(overlay);
}

/**
 * Log what actually broke, then show the player-facing overlay. The overlay says
 * "The road washed out" and nothing more by design, so without this the detail
 * only ever reached the console and was gone when the tab closed (#221). Reading
 * it back is the telemetry.html dashboard's job.
 */
function reportError(source: ErrorSource, message: string, stack: string): void {
  recordError({ source, message, stack });
  showBootError();
}

if (typeof window !== 'undefined') {
  // Uncaught script errors arrive as ErrorEvents; a failed resource load dispatches
  // a plain Event we ignore, so a missing asset does not raise the fatal overlay.
  window.addEventListener('error', (event) => {
    if (event instanceof ErrorEvent) {
      reportError('error', event.message, event.error instanceof Error ? (event.error.stack ?? '') : '');
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason;
    reportError(
      'rejection',
      reason instanceof Error ? reason.message : String(reason),
      reason instanceof Error ? (reason.stack ?? '') : '',
    );
  });
}

try {
  new Phaser.Game(config);
} catch (err) {
  // A throw here means no scene ever started, which is the worst case to have no
  // detail for: the canvas is blank and there is nothing else to go on.
  reportError('boot', err instanceof Error ? err.message : String(err), err instanceof Error ? (err.stack ?? '') : '');
}
