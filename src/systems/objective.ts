// objective.ts
// Pure logic for the on-screen objective line and its wayfinding headings.
// The scene gathers plain inputs (names, tiles, path note, mission summary) and
// this module decides the text, so the branchy wording stays testable and out of
// the Phaser scene.

import { bearingLabel } from './bearing';

export type ObjectiveStatus = 'accepted' | 'carrying' | 'delivered';

/** A tile coordinate. */
export interface Tile {
  readonly x: number;
  readonly y: number;
}

/** The active contract, flattened to just what the objective line needs. */
export interface ObjectiveContractView {
  readonly title: string;
  readonly cargo: string;
  readonly status: ObjectiveStatus;
  readonly pickupName: string;
  readonly pickupTile: Tile | null;
  readonly destinationName: string;
  readonly destinationTile: Tile | null;
  /** Precomputed route note for the carry leg, e.g. ' (12 tiles)' or ' (no route yet)'; '' when none. */
  readonly pathNote: string;
}

/** Everything the objective line needs, gathered by the scene. */
export interface ObjectiveView {
  readonly courierTile: Tile;
  /** Active contract, or null when the courier is empty-handed. */
  readonly contract: ObjectiveContractView | null;
  readonly regionName: string;
  readonly homeName: string;
  /** Active mission step summary (with any progress note), or null when no mission is active. */
  readonly missionSummary: string | null;
  /** True when the contract board has nothing left to offer. */
  readonly boardEmpty: boolean;
  /** True when the courier is standing at the home settlement. */
  readonly atHome: boolean;
  /** Human-readable list of gateway destinations, for the cleared-region prompt. */
  readonly gatewayNames: string;
  /** All region gateway tiles, used to point toward the nearest one. */
  readonly gatewayTiles: readonly Tile[];
}

/** Compass heading from the courier to a target tile, or '' when standing on it. */
export function headingTo(from: Tile, target: Tile): string {
  return bearingLabel(from, target) ?? '';
}

/** Heading toward the closest gateway tile, or '' when there are none. */
export function nearestGatewayHeading(from: Tile, gatewayTiles: readonly Tile[]): string {
  let best: Tile | undefined;
  let bestDist = Infinity;
  for (const tile of gatewayTiles) {
    const dist = (tile.x - from.x) ** 2 + (tile.y - from.y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = tile;
    }
  }
  return best === undefined ? '' : headingTo(from, best);
}

/** Builds the single objective line shown in the HUD. */
export function objectiveText(view: ObjectiveView): string {
  const { contract } = view;

  if (contract === null) {
    // With no cargo in hand, lead with the spine: the active mission step is the
    // strategic through-line. Fall back to tactical guidance when no mission is
    // active (for example after the arc resolves).
    if (view.missionSummary !== null) {
      return `Mission: ${view.missionSummary}`;
    }
    if (view.boardEmpty) {
      const dir = nearestGatewayHeading(view.courierTile, view.gatewayTiles);
      const lead = dir === '' ? 'Travel to the gateway' : `Head ${dir} to the gateway`;
      return `${view.regionName} cleared. ${lead} (press T) to reach ${view.gatewayNames}.`;
    }
    if (view.atHome) {
      return 'Choose a contract from the board.';
    }
    return `Return to ${view.homeName} for a new contract.`;
  }

  switch (contract.status) {
    case 'accepted': {
      // Spell out both legs and point the way to the pickup: a player could not
      // tell which direction to drive to a still-fogged place, nor where the cargo
      // was ultimately bound (see docs/design/05_playtest_notes.md).
      const pickupDir =
        contract.pickupTile === null ? '' : headingTo(view.courierTile, contract.pickupTile);
      const pickupWhere =
        pickupDir === '' ? contract.pickupName : `${contract.pickupName} (${pickupDir})`;
      return `${contract.title}: collect ${contract.cargo} at ${pickupWhere}, then deliver to ${contract.destinationName}`;
    }
    case 'carrying': {
      const dir =
        contract.destinationTile === null
          ? ''
          : headingTo(view.courierTile, contract.destinationTile);
      const heading = dir === '' ? '' : ` - head ${dir}`;
      return `${contract.title}: deliver to ${contract.destinationName}${heading}${contract.pathNote}`;
    }
    case 'delivered':
      return `${contract.title}: delivered. Well driven.`;
  }
}
