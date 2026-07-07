import { describe, it, expect } from 'vitest';
import {
  computeWorldState,
  settlementStatus,
  reconnectedCount,
  silentCount,
  type WorldStateInput,
} from '../../src/systems/world-state';

const SETTLEMENTS = [
  { id: 'home' },
  { id: 'north' },
  { id: 'east' },
  { id: 'outpost' }, // no inbound contract
];

const CONTRACTS = [
  { id: 'c-north', destinationId: 'north' },
  { id: 'c-east', destinationId: 'east' },
];

function makeInput(overrides: Partial<WorldStateInput> = {}): WorldStateInput {
  return {
    settlements: SETTLEMENTS,
    contracts: CONTRACTS,
    homeId: 'home',
    completedContractIds: [],
    ...overrides,
  };
}

describe('settlementStatus', () => {
  it('reports the home town as home', () => {
    expect(settlementStatus(makeInput(), 'home')).toBe('home');
  });

  it('reports an undelivered contract destination as silent', () => {
    expect(settlementStatus(makeInput({ completedContractIds: [] }), 'north')).toBe('silent');
  });

  it('reports a delivered contract destination as reconnected', () => {
    expect(settlementStatus(makeInput({ completedContractIds: ['c-north'] }), 'north')).toBe('reconnected');
  });

  it('treats a settlement with no inbound contract as reconnected (neutral, not silent)', () => {
    expect(settlementStatus(makeInput(), 'outpost')).toBe('reconnected');
  });

  it('reconnects a destination when any of its inbound contracts is delivered', () => {
    const input = makeInput({
      contracts: [
        { id: 'c-north-a', destinationId: 'north' },
        { id: 'c-north-b', destinationId: 'north' },
      ],
      completedContractIds: ['c-north-b'],
    });
    expect(settlementStatus(input, 'north')).toBe('reconnected');
  });
});

describe('computeWorldState', () => {
  it('returns a status for every settlement', () => {
    const state = computeWorldState(makeInput({ completedContractIds: ['c-north'] }));
    expect(state).toEqual({
      home: 'home',
      north: 'reconnected',
      east: 'silent',
      outpost: 'reconnected',
    });
  });

  it('starts every contract destination silent before any delivery', () => {
    const state = computeWorldState(makeInput());
    expect(state.north).toBe('silent');
    expect(state.east).toBe('silent');
  });
});

describe('counts', () => {
  it('counts reconnected and silent settlements', () => {
    const state = computeWorldState(makeInput({ completedContractIds: ['c-north'] }));
    // reconnected: north (delivered) + outpost (no inbound); silent: east
    expect(reconnectedCount(state)).toBe(2);
    expect(silentCount(state)).toBe(1);
  });
});
