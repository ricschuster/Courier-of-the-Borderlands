import { describe, it, expect } from 'vitest';
import {
  startContract,
  canAccept,
  canPickUp,
  canDeliver,
  pickUp,
  deliver,
  isDelivered,
  type Contract,
} from '../../src/systems/contract-system';

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
