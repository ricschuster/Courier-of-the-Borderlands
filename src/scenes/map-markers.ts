import Phaser from 'phaser';
import { TILE_SIZE } from '../config/game-config';
import { getRegion, type Region } from '../systems/region-system';
import type { SettlementStatus } from '../systems/world-state';
import { STATUS_COLOR } from './map-hud';

// Markers sit at the bottom of the stack, below fog and the courier (fog and
// courier depths live in map-scene.ts).
const DEPTH_MARKER = 1;

/**
 * Presentation layer for the markers drawn over the tile map: settlement boxes,
 * region gateways, and the ford-key signpost. Owns the GameObjects it creates so
 * the scene stays focused on game state. Mirrors the MapHud pattern: constructed
 * with the live scene and wraps its factory calls.
 */
export class MapMarkers {
  private readonly scene: Phaser.Scene;
  private readonly mapOriginY: number;
  // Settlement marker rectangles keyed by settlement id, so their fill can be
  // recoloured when a delivery reconnects a place.
  private readonly settlementMarkers = new Map<string, Phaser.GameObjects.Rectangle>();

  constructor(scene: Phaser.Scene, mapOriginY: number) {
    this.scene = scene;
    this.mapOriginY = mapOriginY;
  }

  private tileCenter(tileX: number, tileY: number): { x: number; y: number } {
    return {
      x: tileX * TILE_SIZE + TILE_SIZE / 2,
      y: this.mapOriginY + tileY * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  /** Draw a box and label for every settlement, coloured by world-state. */
  addSettlements(region: Region, status: Record<string, SettlementStatus>): void {
    this.settlementMarkers.clear();
    for (const settlement of Object.values(region.settlements)) {
      const center = this.tileCenter(settlement.tile.x, settlement.tile.y);
      const fill = STATUS_COLOR[status[settlement.id] ?? 'silent'];
      const marker = this.scene.add
        .rectangle(center.x, center.y, TILE_SIZE * 0.5, TILE_SIZE * 0.5, fill)
        .setStrokeStyle(2, 0x1a1a1a)
        .setDepth(DEPTH_MARKER);
      this.settlementMarkers.set(settlement.id, marker);
      this.scene.add
        .text(center.x, center.y + TILE_SIZE * 0.5, settlement.name, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#f2efe4',
        })
        .setOrigin(0.5)
        .setDepth(DEPTH_MARKER);
    }
  }

  /** Recolour the settlement markers to match current world-state. */
  refreshSettlements(status: Record<string, SettlementStatus>): void {
    for (const [id, marker] of this.settlementMarkers) {
      marker.setFillStyle(STATUS_COLOR[status[id] ?? 'silent']);
    }
  }

  addGateways(region: Region, mapWidth: number, mapHeight: number): void {
    for (const gateway of region.gateways) {
      // Every gateway sits on an open-road tile toward the map edge, off any town
      // (the Fenmarch crossing was moved south off Southmill, per playtest), so
      // each gets its own outline box and a "road to X" label above the tile. The
      // marker is what makes the way out of the region discoverable on the map.
      // See docs/design/05_playtest_notes.md.
      const center = this.tileCenter(gateway.tile.x, gateway.tile.y);
      this.scene.add
        .rectangle(center.x, center.y, TILE_SIZE * 0.6, TILE_SIZE * 0.6)
        .setStrokeStyle(2, 0x6fd0e0)
        .setDepth(DEPTH_MARKER);
      const destName = getRegion(gateway.to).name;
      const label = this.scene.add
        .text(center.x, center.y - TILE_SIZE * 0.55, `road to ${destName}`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#6fd0e0',
        })
        .setOrigin(0.5)
        .setDepth(DEPTH_MARKER);
      // Keep the whole label inside the map bounds so an edge gateway name is not
      // cut off ("road to Salt" ran off the screen at the map edge; see
      // docs/design/05_playtest_notes.md). The camera clamps to these same bounds.
      const worldW = mapWidth * TILE_SIZE;
      const worldH = mapHeight * TILE_SIZE;
      const halfW = label.width / 2 + 2;
      const halfH = label.height / 2 + 2;
      label.setX(Phaser.Math.Clamp(label.x, halfW, worldW - halfW));
      label.setY(Phaser.Math.Clamp(label.y, this.mapOriginY + halfH, this.mapOriginY + worldH - halfH));
    }
  }

  /**
   * Draw the ford-key signpost and wire its overlap with the courier. onReach
   * runs when the courier touches it and returns whether the unlock fired; the
   * signpost is destroyed only when it did, so a failed unlock leaves it standing.
   */
  addSignpost(
    tile: { x: number; y: number },
    courier: Phaser.GameObjects.GameObject,
    onReach: () => boolean,
  ): void {
    const center = this.tileCenter(tile.x, tile.y);
    const signpost = this.scene.add.rectangle(
      center.x,
      center.y,
      TILE_SIZE * 0.5,
      TILE_SIZE * 0.5,
      0xe8d8b0,
    );
    this.scene.physics.add.existing(signpost, true);
    this.scene.add
      .text(center.x, center.y - TILE_SIZE * 0.6, 'ford key', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#e8d8b0',
      })
      .setOrigin(0.5);

    this.scene.physics.add.overlap(courier, signpost, () => {
      if (onReach()) {
        signpost.destroy();
      }
    });
  }
}
