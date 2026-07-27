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

/**
 * Tiles of survey a Wayfinder rank adds *beyond the walked fog*.
 *
 * This is a margin, not an absolute radius (#361). It used to be absolute, which
 * made the ring inert: walked fog reaches 2.5 base plus 3.5 from the two reveal
 * upgrades plus 1 per Wayfinder rank, so an absolute 3-per-rank ring sat inside
 * the fog at every rank for any courier who had bought the upgrades, and at rank
 * 3 the two were exactly equal. The skill's headline payoff could not show a
 * single tile the player could not already see. Measured at 0 of 69 routes
 * changed; see docs/design/06_wayfinder_survey_ring.md.
 */
export const SURVEY_TILES_PER_WAYFINDER_RANK = 2;

/**
 * Minimap survey radius (tiles) for a Wayfinder of the given rank.
 *
 * Rank 0 returns 0, which disables the ring entirely, so only a Wayfinder sees
 * terrain beyond the fog they have walked. Every other rank returns the current
 * reveal radius plus a margin, so the ring **always** shows ground the fog does
 * not, whatever the courier has fitted and whatever the weather is doing.
 *
 * Pass the live reveal radius, weather included: when bad weather pulls the fog
 * in, the survey comes with it. A courier who cannot see is not helped by a
 * minimap that pretends otherwise.
 */
export function wayfinderSurveyRadius(rank: number, revealRadius: number): number {
  const ranks = Math.max(0, Math.floor(rank));
  if (ranks === 0) {
    return 0;
  }
  return Math.max(0, revealRadius) + ranks * SURVEY_TILES_PER_WAYFINDER_RANK;
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

/**
 * How a surveyed-but-unwalked cell is drawn, kept here beside the model rather
 * than as loose numbers in the renderer.
 *
 * #425: the ring shipped at 0.4 alpha with no other distinction, and a player who
 * owned Wayfinder, saw the band, and had read the skill description still could
 * not name it after a full arc. Over the near-black fog base that reads as
 * "slightly less dark", not as "terrain I know about but have not driven".
 *
 * Two changes, because alpha alone cannot fix it. Raising the alpha makes the
 * terrain colour legible, but on its own it just makes surveyed ground look like
 * walked ground, trading one confusion for a worse one. So the band is also
 * inset, leaving a dark gutter around every surveyed cell: walked ground is
 * solid and continuous, surveyed ground is a field of separated tiles. That
 * distinction survives at any colour, and it does not depend on the player
 * comparing two brightnesses from memory.
 */
export const SURVEYED_ALPHA = 0.75;

/** Gutter in pixels left around a surveyed cell, on top of the usual 1px grid gap. */
export const SURVEYED_INSET = 1;

/**
 * Whether a survey ring of this radius would show any unwalked, on-map tile from
 * this position: the moment the skill first has something to say.
 *
 * The trigger for the "name it once" teach (#425). It deliberately does NOT take
 * a MinimapModel, because the minimap starts hidden (`map-hud.ts`) and its model
 * is only built while it is open. The whole failure being fixed is a player who
 * owned Wayfinder and never saw the band, so a teach that waited for the minimap
 * to be open would reach mostly the people who did not need it.
 *
 * Scans only the ring's bounding box rather than the grid, so it stays cheap
 * enough to call every frame with the minimap closed.
 *
 * The rule matches `surveyed` in buildMinimap: unwalked, in bounds, and inside
 * the radius. In-bounds is what stands in for the model's `terrainColorAt`
 * check, which returns null exactly off-map.
 */
export function surveyWouldShowUnwalked(input: {
  readonly width: number;
  readonly height: number;
  readonly isRevealed: (x: number, y: number) => boolean;
  readonly courier: { readonly x: number; readonly y: number };
  readonly surveyRadius: number;
}): boolean {
  const { width, height, isRevealed, courier, surveyRadius } = input;
  if (surveyRadius <= 0) {
    return false;
  }
  const reach = Math.ceil(surveyRadius);
  const top = Math.max(0, courier.y - reach);
  const bottom = Math.min(height - 1, courier.y + reach);
  const left = Math.max(0, courier.x - reach);
  const right = Math.min(width - 1, courier.x + reach);

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (isRevealed(x, y)) {
        continue;
      }
      if (Math.hypot(x - courier.x, y - courier.y) <= surveyRadius) {
        return true;
      }
    }
  }
  return false;
}
