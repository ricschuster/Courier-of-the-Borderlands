// Pure minimap model builder. No Phaser dependency.
// Converts world state (fog, terrain colours, positions) into a flat
// row-major grid of MinimapCells ready for a renderer to consume.

import type { SettlementStatus } from './world-state';

export type MinimapMarker = 'courier' | 'settlement' | null;

export interface MinimapCell {
  readonly revealed: boolean;
  /**
   * Surveyed but not walked: within a Wayfinder survey ring of the courier, so
   * its terrain shows on the minimap (dimmed) as a route-planning aid, without
   * clearing the main-map fog. Never true on a revealed cell.
   */
  readonly surveyed: boolean;
  readonly color: number | null; // terrain fill colour when revealed or surveyed, null when fogged
  readonly marker: MinimapMarker;
  /** Connection status of the settlement on this cell, when marker is 'settlement'. */
  readonly settlementStatus: SettlementStatus | null;
}

export interface MinimapInput {
  readonly width: number;
  readonly height: number;
  readonly isRevealed: (x: number, y: number) => boolean;
  readonly terrainColorAt: (x: number, y: number) => number | null; // null if out of map
  readonly courier: { readonly x: number; readonly y: number }; // tile coords
  readonly settlements: readonly {
    readonly x: number;
    readonly y: number;
    /** Optional connection status, carried onto the settlement cell for colouring. */
    readonly status?: SettlementStatus;
  }[];
  /**
   * Tiles within this many tiles of the courier show their terrain on the
   * minimap even when unwalked (a transient Wayfinder survey ring, recomputed
   * from the current position each redraw). 0 disables the survey. Absent is 0.
   */
  readonly surveyRadius?: number;
}

/** Tiles of minimap survey a Wayfinder grants around the courier, per rank. */
export const SURVEY_TILES_PER_WAYFINDER_RANK = 3;

/**
 * Minimap survey radius (tiles) for a Wayfinder of the given rank. Rank 0 (no
 * Wayfinder) is 0, which disables the survey ring, so only a Wayfinder sees
 * terrain beyond the fog they have walked.
 */
export function wayfinderSurveyRadius(rank: number): number {
  return Math.max(0, Math.floor(rank)) * SURVEY_TILES_PER_WAYFINDER_RANK;
}

export interface MinimapModel {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly MinimapCell[]; // row-major, length === width * height
}

/** Build a snapshot MinimapModel from the provided input callbacks. */
export function buildMinimap(input: MinimapInput): MinimapModel {
  const { width, height, isRevealed, terrainColorAt, courier, settlements } = input;
  const surveyRadius = input.surveyRadius ?? 0;

  // Build a fast lookup from settlement position to its status.
  const settlementStatusByKey = new Map<string, SettlementStatus | null>();
  for (const s of settlements) {
    settlementStatusByKey.set(`${s.x},${s.y}`, s.status ?? null);
  }

  const courierKey = `${courier.x},${courier.y}`;

  const cells: MinimapCell[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const revealed = isRevealed(x, y);
      // A surveyed tile is unwalked terrain inside the survey ring: show its
      // colour on the minimap, but never mark a walked tile as merely surveyed.
      const surveyed =
        !revealed &&
        surveyRadius > 0 &&
        Math.hypot(x - courier.x, y - courier.y) <= surveyRadius &&
        terrainColorAt(x, y) !== null;
      const color = revealed || surveyed ? terrainColorAt(x, y) : null;

      const tileKey = `${x},${y}`;
      let marker: MinimapMarker = null;
      let settlementStatus: SettlementStatus | null = null;

      if (tileKey === courierKey) {
        // Courier always takes precedence, regardless of reveal state.
        marker = 'courier';
      } else if (revealed && settlementStatusByKey.has(tileKey)) {
        // Settlement marker only when the tile is revealed and not the courier
        // tile: the survey shows terrain shape, not the identity of places you
        // have not yet reached.
        marker = 'settlement';
        settlementStatus = settlementStatusByKey.get(tileKey) ?? null;
      }

      cells.push({ revealed, surveyed, color, marker, settlementStatus });
    }
  }

  return { width, height, cells };
}
