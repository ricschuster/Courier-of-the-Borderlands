import { describe, it, expect } from 'vitest';
import {
  startContract,
  canAccept,
  canPickUp,
  canDeliver,
  pickUp,
  deliver,
  isDelivered,
  isContractAvailable,
  availableContracts,
  contractsInPlay,
  baseContracts,
  type Contract,
} from '../../src/systems/contract-system';
import { emptyFlags, flagsFromArray } from '../../src/systems/dialogue';

const CONTRACT: Contract = {
  id: 'test',
  title: 'Test Run',
  cargo: 'parcels',
  pickupId: 'town-a',
  destinationId: 'town-b',
  reward: 50,
  reputation: 2,
  minReputation: 3,
  note: 'note',
};

describe('contract-system', () => {
  it('starts a contract in the accepted state', () => {
    const progress = startContract(CONTRACT);
    expect(progress).toEqual({ contractId: 'test', status: 'accepted' });
  });

  it('gates acceptance on minimum reputation', () => {
    // CONTRACT.minReputation is 3.
    expect(canAccept(CONTRACT, 2)).toBe(false);
    expect(canAccept(CONTRACT, 3)).toBe(true);
    expect(canAccept(CONTRACT, 5)).toBe(true);
    expect(canAccept({ ...CONTRACT, minReputation: 0 }, 0)).toBe(true);
  });

  it('allows pickup only at the pickup settlement while accepted', () => {
    const progress = startContract(CONTRACT);
    expect(canPickUp(progress, CONTRACT, 'town-a')).toBe(true);
    expect(canPickUp(progress, CONTRACT, 'town-b')).toBe(false);
  });

  it('does not allow delivery before pickup', () => {
    const progress = startContract(CONTRACT);
    expect(canDeliver(progress, CONTRACT, 'town-b')).toBe(false);
  });

  it('runs the full accept -> carry -> deliver loop', () => {
    let progress = startContract(CONTRACT);

    progress = pickUp(progress);
    expect(progress.status).toBe('carrying');
    expect(canDeliver(progress, CONTRACT, 'town-b')).toBe(true);
    expect(canDeliver(progress, CONTRACT, 'town-a')).toBe(false);

    progress = deliver(progress);
    expect(progress.status).toBe('delivered');
    expect(isDelivered(progress)).toBe(true);
  });

  it('ignores out-of-order transitions', () => {
    const accepted = startContract(CONTRACT);
    // Cannot deliver straight from accepted.
    expect(deliver(accepted).status).toBe('accepted');

    const delivered = deliver(pickUp(accepted));
    // Cannot pick up again once delivered.
    expect(pickUp(delivered).status).toBe('delivered');
  });
});

describe('contract availability gating', () => {
  const standing: Contract = { ...CONTRACT, id: 'standing', minReputation: 0 };
  const gated: Contract = {
    ...CONTRACT,
    id: 'gated',
    minReputation: 0,
    requires: { allOf: ['arc_started'] },
  };
  const all = [standing, gated];
  const none: ReadonlySet<string> = new Set();

  it('treats an ungated contract as available whenever not completed', () => {
    expect(isContractAvailable(standing, none, emptyFlags())).toBe(true);
    expect(isContractAvailable(standing, new Set(['standing']), emptyFlags())).toBe(false);
  });

  it('hides a gated contract until its flag condition is met', () => {
    expect(isContractAvailable(gated, none, emptyFlags())).toBe(false);
    expect(isContractAvailable(gated, none, flagsFromArray(['arc_started']))).toBe(true);
  });

  it('availableContracts excludes completed and unrevealed gated contracts', () => {
    expect(availableContracts(all, none, emptyFlags()).map((c) => c.id)).toEqual(['standing']);
    expect(availableContracts(all, none, flagsFromArray(['arc_started'])).map((c) => c.id)).toEqual([
      'standing',
      'gated',
    ]);
    expect(
      availableContracts(all, new Set(['standing']), flagsFromArray(['arc_started'])).map((c) => c.id),
    ).toEqual(['gated']);
  });

  it('contractsInPlay counts completed plus currently-available, not hidden gated', () => {
    // Before the reveal: only the standing contract is in play.
    expect(contractsInPlay(all, none, emptyFlags()).map((c) => c.id)).toEqual(['standing']);
    // After clearing the standing one but before the reveal: it still counts
    // (completed), the gated one does not.
    expect(contractsInPlay(all, new Set(['standing']), emptyFlags()).map((c) => c.id)).toEqual([
      'standing',
    ]);
    // After the reveal: the gated contract enters the count.
    expect(contractsInPlay(all, new Set(['standing']), flagsFromArray(['arc_started'])).map((c) => c.id)).toEqual([
      'standing',
      'gated',
    ]);
  });

  it('baseContracts returns only the ungated standing routes', () => {
    expect(baseContracts(all).map((c) => c.id)).toEqual(['standing']);
  });
});
