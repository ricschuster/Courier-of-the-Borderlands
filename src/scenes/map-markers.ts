import Phaser from 'phaser';
import { TILE_SIZE } from '../config/game-config';
import { getRegion, type Region } from '../systems/region-system';
import type { SettlementStatus } from '../systems/world-state';
import type { EncounterTile } from '../systems/encounter-system';
import { STATUS_COLOR } from './map-hud';
import {
  MARKER_ATLAS_KEY,
  SIGNPOST_FRAME,
  houseForIndex,
  type HouseArt,
} from '../data/marker-art';

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
  // Settlement status pips keyed by settlement id, so their colour can be
  // recoloured when a delivery reconnects a place (the house sprite itself does
  // not change; the pip below it carries the world-state feedback).
  private readonly settlementMarkers = new Map<string, Phaser.GameObjects.Arc>();
  // Road-encounter markers (a diamond + "?" per active encounter tile). Rebuilt
  // as encounters activate or resolve, so the list is torn down and redrawn.
  private encounterMarkers: Phaser.GameObjects.GameObject[] = [];

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

  /** Draw a little house, a status pip, and a label for every settlement. */
  addSettlements(region: Region, status: Record<string, SettlementStatus>): void {
    this.settlementMarkers.clear();
    Object.values(region.settlements).forEach((settlement, i) => {
      const center = this.tileCenter(settlement.tile.x, settlement.tile.y);
      this.drawHouse(center, houseForIndex(i));
      // The house sits on its tile with the roof rising above it; the pip and
      // label sit just below, so nothing overlaps the building.
      const baseY = center.y + TILE_SIZE * 0.5;
      const pip = this.scene.add
        .circle(center.x, baseY + TILE_SIZE * 0.12, TILE_SIZE * 0.1, STATUS_COLOR[status[settlement.id] ?? 'silent'])
        .setStrokeStyle(2, 0x1a1a1a)
        .setDepth(DEPTH_MARKER);
      this.settlementMarkers.set(settlement.id, pip);
      this.scene.add
        .text(center.x, baseY + TILE_SIZE * 0.32, settlement.name, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#f2efe4',
        })
        .setOrigin(0.5)
        .setDepth(DEPTH_MARKER);
    });
  }

  /**
   * A settlement building: a wall-with-door tile on its ground tile, a pitched
   * roof stacked directly above it, so the house reads as rising off the map.
   */
  private drawHouse(center: { x: number; y: number }, art: HouseArt): void {
    const size = TILE_SIZE * 0.82;
    const tileBottom = center.y + TILE_SIZE * 0.5;
    const wallY = tileBottom - size * 0.5;
    this.scene.add
      .image(center.x, wallY, MARKER_ATLAS_KEY, art.wall)
      .setDisplaySize(size, size)
      .setDepth(DEPTH_MARKER);
    this.scene.add
      .image(center.x, wallY - size, MARKER_ATLAS_KEY, art.roof)
      .setDisplaySize(size, size)
      .setDepth(DEPTH_MARKER);
  }

  /** Recolour the settlement status pips to match current world-state. */
  refreshSettlements(status: Record<string, SettlementStatus>): void {
    for (const [id, pip] of this.settlementMarkers) {
      pip.setFillStyle(STATUS_COLOR[status[id] ?? 'silent']);
    }
  }

  /**
   * Redraw the road-encounter markers: a small amber diamond with a "?" above
   * each active encounter tile, telling the player something waits there before
   * they drive onto it (#184). Called on load and whenever encounters activate
   * or resolve. Markers sit at DEPTH_MARKER, so fog still hides each one until
   * the courier reveals its tile.
   */
  setEncounters(tiles: readonly EncounterTile[]): void {
    for (const marker of this.encounterMarkers) {
      marker.destroy();
    }
    this.encounterMarkers = [];
    for (const tile of tiles) {
      const center = this.tileCenter(tile.x, tile.y);
      const diamond = this.scene.add
        .rectangle(center.x, center.y, TILE_SIZE * 0.42, TILE_SIZE * 0.42, 0xe0a83a)
        .setStrokeStyle(2, 0x3a2a10)
        .setAngle(45)
        .setDepth(DEPTH_MARKER);
      const glyph = this.scene.add
        .text(center.x, center.y, '?', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#3a2a10',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(DEPTH_MARKER);
      this.encounterMarkers.push(diamond, glyph);
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
        .image(center.x, center.y, MARKER_ATLAS_KEY, SIGNPOST_FRAME)
        .setDisplaySize(TILE_SIZE * 0.7, TILE_SIZE * 0.7)
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
    const signpost = this.scene.add
      .image(center.x, center.y, MARKER_ATLAS_KEY, SIGNPOST_FRAME)
      .setDisplaySize(TILE_SIZE * 0.7, TILE_SIZE * 0.7);
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
