import { describe, it, expect } from 'vitest';
import {
  objectiveText,
  headingTo,
  nearestGatewayHeading,
  navRevealFor,
  type ObjectiveView,
  type ObjectiveContractView,
} from '../../src/systems/objective';

const HERE = { x: 5, y: 5 };

/** A no-contract view with sensible defaults; override per case. */
function emptyView(overrides: Partial<ObjectiveView> = {}): ObjectiveView {
  return {
    courierTile: HERE,
    contract: null,
    regionName: 'Greybridge',
    homeName: 'Greybridge',
    missionSummary: null,
    boardEmpty: false,
    atHome: false,
    gatewayNames: 'Saltreach',
    gatewayTiles: [],
    navReveal: 'full',
    ...overrides,
  };
}

function contractView(overrides: Partial<ObjectiveContractView> = {}): ObjectiveContractView {
  return {
    title: 'The Reed Ledger',
    cargo: 'a sealed ledger',
    status: 'accepted',
    pickupName: 'Southmill',
    pickupTile: { x: 5, y: 1 }, // due north of HERE
    destinationName: 'Mirewatch',
    destinationTile: { x: 9, y: 9 }, // south-east of HERE
    pathNote: '',
    ...overrides,
  };
}

describe('headingTo', () => {
  it('returns a compass label toward the target', () => {
    expect(headingTo(HERE, { x: 5, y: 1 })).toBe('N');
    expect(headingTo(HERE, { x: 9, y: 9 })).toBe('SE');
  });

  it("returns '' when standing on the target", () => {
    expect(headingTo(HERE, HERE)).toBe('');
  });
});

describe('nearestGatewayHeading', () => {
  it('points at the closest gateway by squared distance', () => {
    const heading = nearestGatewayHeading(HERE, [
      { x: 5, y: 0 }, // far north
      { x: 6, y: 5 }, // one tile east, closest
    ]);
    expect(heading).toBe('E');
  });

  it("returns '' when there are no gateways", () => {
    expect(nearestGatewayHeading(HERE, [])).toBe('');
  });

  it("returns '' when the only gateway is the current tile", () => {
    expect(nearestGatewayHeading(HERE, [HERE])).toBe('');
  });
});

describe('objectiveText with no active contract', () => {
  it('leads with the mission spine when a mission is active', () => {
    const text = objectiveText(emptyView({ missionSummary: 'Reconnect the region (1/3)' }));
    expect(text).toBe('Mission: Reconnect the region (1/3)');
  });

  it('prefers the mission line even when the board is empty', () => {
    const text = objectiveText(
      emptyView({ missionSummary: 'Reach the far gate', boardEmpty: true }),
    );
    expect(text).toBe('Mission: Reach the far gate');
  });

  it('gives a cleared-region prompt with a gateway heading when the board is empty', () => {
    const text = objectiveText(
      emptyView({ boardEmpty: true, gatewayNames: 'Saltreach', gatewayTiles: [{ x: 9, y: 5 }] }),
    );
    expect(text).toBe('Greybridge cleared. Head E to the gateway (press T) to reach Saltreach.');
  });

  it('falls back to a plain travel prompt when no gateway direction is available', () => {
    const text = objectiveText(emptyView({ boardEmpty: true, gatewayTiles: [] }));
    expect(text).toBe('Greybridge cleared. Travel to the gateway (press T) to reach Saltreach.');
  });

  it('prompts to choose a contract when standing at home', () => {
    expect(objectiveText(emptyView({ atHome: true }))).toBe('Choose a contract from the board.');
  });

  it('directs the courier home when away with contracts waiting', () => {
    expect(objectiveText(emptyView({ homeName: 'Greybridge' }))).toBe(
      'Return to Greybridge for a new contract.',
    );
  });
});

describe('objectiveText while on a contract', () => {
  it('spells out both legs and points to the pickup when accepted', () => {
    const text = objectiveText(emptyView({ contract: contractView({ status: 'accepted' }) }));
    expect(text).toBe(
      'The Reed Ledger: collect a sealed ledger at Southmill (N), then deliver to Mirewatch',
    );
  });

  it('omits the pickup heading when standing on the pickup tile', () => {
    const text = objectiveText(
      emptyView({ contract: contractView({ status: 'accepted', pickupTile: HERE }) }),
    );
    expect(text).toBe(
      'The Reed Ledger: collect a sealed ledger at Southmill, then deliver to Mirewatch',
    );
  });

  it('omits the pickup heading when the pickup tile is unknown', () => {
    const text = objectiveText(
      emptyView({ contract: contractView({ status: 'accepted', pickupTile: null }) }),
    );
    expect(text).toContain('collect a sealed ledger at Southmill,');
    expect(text).not.toContain('(');
  });

  it('shows the destination heading and route note when carrying', () => {
    const text = objectiveText(
      emptyView({ contract: contractView({ status: 'carrying', pathNote: ' (12 tiles)' }) }),
    );
    expect(text).toBe('The Reed Ledger: deliver to Mirewatch - head SE (12 tiles)');
  });

  it('drops the heading when standing on the destination while carrying', () => {
    const text = objectiveText(
      emptyView({
        contract: contractView({ status: 'carrying', destinationTile: HERE, pathNote: '' }),
      }),
    );
    expect(text).toBe('The Reed Ledger: deliver to Mirewatch');
  });

  it('carries the no-route note through unchanged', () => {
    const text = objectiveText(
      emptyView({
        contract: contractView({ status: 'carrying', pathNote: ' (no route yet)' }),
      }),
    );
    expect(text).toBe('The Reed Ledger: deliver to Mirewatch - head SE (no route yet)');
  });

  it('congratulates on delivery', () => {
    const text = objectiveText(emptyView({ contract: contractView({ status: 'delivered' }) }));
    expect(text).toBe('The Reed Ledger: delivered. Well driven.');
  });
});

describe('navRevealFor difficulty mapping (#171)', () => {
  it('gives full help on relaxed, heading-only on standard, none on demanding', () => {
    expect(navRevealFor('relaxed')).toBe('full');
    expect(navRevealFor('standard')).toBe('heading');
    expect(navRevealFor('demanding')).toBe('none');
  });
});

describe('objectiveText nav reveal gating (#171)', () => {
  it("'full' keeps the heading and the distance note when carrying", () => {
    const text = objectiveText(
      emptyView({
        navReveal: 'full',
        contract: contractView({ status: 'carrying', pathNote: ' (12 tiles)' }),
      }),
    );
    expect(text).toBe('The Reed Ledger: deliver to Mirewatch - head SE (12 tiles)');
  });

  it("'heading' keeps the direction but drops the distance note when carrying", () => {
    const text = objectiveText(
      emptyView({
        navReveal: 'heading',
        contract: contractView({ status: 'carrying', pathNote: ' (12 tiles)' }),
      }),
    );
    expect(text).toBe('The Reed Ledger: deliver to Mirewatch - head SE');
  });

  it("'none' drops both the heading and the distance when carrying", () => {
    const text = objectiveText(
      emptyView({
        navReveal: 'none',
        contract: contractView({ status: 'carrying', pathNote: ' (12 tiles)' }),
      }),
    );
    expect(text).toBe('The Reed Ledger: deliver to Mirewatch');
  });

  it("'heading' still points to the pickup on the accepted leg", () => {
    const text = objectiveText(
      emptyView({ navReveal: 'heading', contract: contractView({ status: 'accepted' }) }),
    );
    expect(text).toBe(
      'The Reed Ledger: collect a sealed ledger at Southmill (N), then deliver to Mirewatch',
    );
  });

  it("'none' withholds the pickup heading on the accepted leg", () => {
    const text = objectiveText(
      emptyView({ navReveal: 'none', contract: contractView({ status: 'accepted' }) }),
    );
    expect(text).toBe(
      'The Reed Ledger: collect a sealed ledger at Southmill, then deliver to Mirewatch',
    );
  });
});
