import Phaser from 'phaser';
import { prefersReducedMotion } from '../systems/reduced-motion';

// Feedback juice (#227): the short, cheap reactions that make an event land.
// Serves the "Small systems, clear feedback" pillar, and nothing else: no effect
// here changes a rule, a number, or what the player can do. Removing the whole
// file would leave the game fully playable and identical to play.
//
// Two things shape every choice below.
//
// Teeth, not confetti. The owner's standing direction is that the game should
// have real teeth. So the hardest effect in here is on *stranding*, not on a
// delivery: the loudest feedback belongs on the moment that hurt. A delivery gets
// a modest pop, not a fireworks show.
//
// Cheap on purpose. The full-arc e2e is a blocking check with a history of
// frame-starvation flake (#114, #121), so this allocates one emitter for the
// scene's lifetime rather than one per event, and every effect is short. Juice is
// deliberately left ON under ?e2e so the arc guards that it never throws.

/**
 * Generated dot used for every burst. Tinted per effect; no art dependency.
 *
 * Sized against TILE_SIZE (48), not picked in the abstract. A 3px dot was the
 * first attempt and was invisible in play: smaller than the speckles already in
 * the Kenney grass texture, so it read as terrain rather than feedback. At 4px
 * scaled to 1.5 a mote is ~6px, an eighth of a tile: legible next to the wagon
 * without becoming a blob.
 */
const PARTICLE_TEXTURE_KEY = 'juice-dot';
const PARTICLE_PX = 4;
const PARTICLE_SCALE = 1.5;

/** Above the courier (6) and fog (5), so a burst is never hidden behind either. */
const DEPTH_PARTICLES = 7;

// Camera shake: [duration ms, intensity]. Intensity is a fraction of the
// viewport, so these are small numbers by design; 0.01 is already a hard knock.
const SHAKE_SOFT: readonly [number, number] = [120, 0.004];
const SHAKE_HARD: readonly [number, number] = [320, 0.012];

/** Burst tints. Coin gold for a payout, rust for damage, pale green for a road opening. */
const TINT_COIN = 0xf2c14e;
const TINT_RUST = 0xa8563a;
const TINT_ROAD = 0x9fd8a0;

/**
 * Scene-lifetime feedback effects. Construct one per create(); it registers no
 * global state and needs no teardown beyond the scene's own.
 *
 * Every method is a no-op when the player has asked for reduced motion, which is
 * checked once at construction rather than per call.
 */
export class Juice {
  private readonly scene: Phaser.Scene;
  private readonly enabled: boolean;
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.enabled = !prefersReducedMotion();
    if (this.enabled) {
      this.ensureTexture();
      this.emitter = this.createEmitter();
    }
  }

  /**
   * Whether motion is playing at all. Exposed for the e2e hook: "juice is
   * suppressed" is otherwise unobservable from outside, and an accessibility
   * promise that is only asserted in a unit test is a promise about a function,
   * not about the game (the #274 lesson: the bug there was a missing caller).
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** A delivery landed: a small gold pop at the wagon. Earned, but not a parade. */
  delivered(x: number, y: number): void {
    this.burst(x, y, TINT_COIN, 12);
  }

  /** An upgrade was fitted: a soft knock, like a part seating into the wagon. */
  upgradeFitted(): void {
    this.shake(SHAKE_SOFT);
  }

  /** A road opened. The biggest good moment in the game, so it gets both. */
  routeUnlocked(x: number, y: number): void {
    this.shake(SHAKE_SOFT);
    this.burst(x, y, TINT_ROAD, 18);
  }

  /** The wagon broke down. The hardest effect here: this is the moment that hurt. */
  stranded(): void {
    this.shake(SHAKE_HARD);
  }

  /** Patched up: a brief scatter of rust, no shake. Relief, not an event. */
  repaired(x: number, y: number): void {
    this.burst(x, y, TINT_RUST, 8);
  }

  // -------------------------------------------------------------------------
  // Primitives
  // -------------------------------------------------------------------------

  private shake([duration, intensity]: readonly [number, number]): void {
    if (!this.enabled) {
      return;
    }
    // Cosmetic only: the camera moves, the wagon does not, so no tile, path, or
    // input logic can see this.
    this.scene.cameras.main.shake(duration, intensity);
  }

  private burst(x: number, y: number, tint: number, count: number): void {
    if (!this.enabled || this.emitter === null) {
      return;
    }
    this.emitter.setParticleTint(tint);
    this.emitter.emitParticleAt(x, y, count);
  }

  /**
   * Register the particle dot once per texture manager. Guarded because the scene
   * restarts on region travel and a new game, which would otherwise re-generate a
   * texture that already exists.
   */
  private ensureTexture(): void {
    if (this.scene.textures.exists(PARTICLE_TEXTURE_KEY)) {
      return;
    }
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, PARTICLE_PX, PARTICLE_PX);
    g.generateTexture(PARTICLE_TEXTURE_KEY, PARTICLE_PX, PARTICLE_PX);
    g.destroy();
  }

  private createEmitter(): Phaser.GameObjects.Particles.ParticleEmitter {
    const emitter = this.scene.add.particles(0, 0, PARTICLE_TEXTURE_KEY, {
      // Long enough to register, short enough never to linger over the map.
      lifespan: 500,
      // Over the lifespan this spreads a mote 20-55px: about one tile, so the
      // burst stays a mark on the wagon rather than a cloud over the region.
      speed: { min: 40, max: 110 },
      angle: { min: 0, max: 360 },
      scale: { start: PARTICLE_SCALE, end: 0 },
      alpha: { start: 1, end: 0 },
      gravityY: 40,
      // Emit only on an explicit call, so this sits idle between events.
      emitting: false,
    });
    emitter.setDepth(DEPTH_PARTICLES);
    return emitter;
  }
}
