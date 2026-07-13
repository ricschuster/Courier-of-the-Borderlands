import { describe, it, expect } from 'vitest';
import {
  isDiscovered,
  foundDiscoveries,
  newlyFound,
  discoveryLines,
  type Discovery,
} from '../../src/systems/discovery';
import { createFog, revealAround } from '../../src/systems/fog-of-war';

const CAIRN: Discovery = {
  id: 'a-cairn',
  regionId: 'greybridge',
  tile: { x: 5, y: 4 },
  title: 'The Cairn',
  note: 'Grey stones.',
  cipherNote: 'The coded line.',
};

const STONE: Discovery = {
  id: 'a-stone',
  regionId: 'saltreach',
  tile: { x: 2, y: 2 },
  title: 'The Stone',
  note: 'A waystone.',
};

const NOTE_ONLY: Discovery = {
  id: 'plain',
  regionId: 'greybridge',
  tile: { x: 9, y: 9 },
  title: 'Plain',
  note: 'No cipher line here.',
};

describe('isDiscovered', () => {
  it('is false while the tile is fogged and true once revealed', () => {
    const fog = createFog(12, 12);
    expect(isDiscovered(CAIRN, fog)).toBe(false);
    revealAround(fog, CAIRN.tile.x, CAIRN.tile.y, 1);
    expect(isDiscovered(CAIRN, fog)).toBe(true);
  });
});

describe('foundDiscoveries', () => {
  it('returns only same-region discoveries whose tile is revealed', () => {
    const fog = createFog(12, 12);
    revealAround(fog, CAIRN.tile.x, CAIRN.tile.y, 1);
    const found = foundDiscoveries([CAIRN, STONE, NOTE_ONLY], 'greybridge', fog);
    expect(found.map((d) => d.id)).toEqual(['a-cairn']);
  });

  it('filters by region even when another region tile happens to be revealed', () => {
    const fog = createFog(12, 12);
    // Reveal the Saltreach tile, but ask for Greybridge: it must not leak in.
    revealAround(fog, STONE.tile.x, STONE.tile.y, 1);
    expect(foundDiscoveries([CAIRN, STONE], 'greybridge', fog)).toEqual([]);
    expect(foundDiscoveries([CAIRN, STONE], 'saltreach', fog).map((d) => d.id)).toEqual([
      'a-stone',
    ]);
  });

  it('preserves list order', () => {
    const fog = createFog(12, 12);
    revealAround(fog, 0, 0, 20); // reveal everything
    expect(foundDiscoveries([CAIRN, NOTE_ONLY], 'greybridge', fog).map((d) => d.id)).toEqual([
      'a-cairn',
      'plain',
    ]);
  });
});

describe('newlyFound', () => {
  it('matches a discovery on a tile revealed this frame', () => {
    const found = newlyFound([CAIRN, STONE], 'greybridge', [
      { x: 1, y: 1 },
      { x: 5, y: 4 },
    ]);
    expect(found.map((d) => d.id)).toEqual(['a-cairn']);
  });

  it('returns nothing when the newly-revealed set is empty (e.g. on reload)', () => {
    expect(newlyFound([CAIRN, STONE], 'greybridge', [])).toEqual([]);
  });

  it('fires once as a tile first reveals and not again when nothing new appears', () => {
    const fog = createFog(12, 12);
    const first = revealAround(fog, CAIRN.tile.x, CAIRN.tile.y, 1);
    expect(newlyFound([CAIRN], 'greybridge', first).map((d) => d.id)).toEqual(['a-cairn']);
    // Revealing the same spot again yields no new tiles, so no re-fire.
    const second = revealAround(fog, CAIRN.tile.x, CAIRN.tile.y, 1);
    expect(newlyFound([CAIRN], 'greybridge', second)).toEqual([]);
  });

  it('ignores a revealed tile that belongs to another region', () => {
    expect(newlyFound([STONE], 'greybridge', [{ x: 2, y: 2 }])).toEqual([]);
  });
});

describe('discoveryLines', () => {
  it('shows title and note without the cipher line by default', () => {
    expect(discoveryLines(CAIRN, false)).toEqual(['The Cairn', 'Grey stones.']);
  });

  it('appends the cipher line when the courier can decode it', () => {
    expect(discoveryLines(CAIRN, true)).toEqual([
      'The Cairn',
      'Grey stones.',
      'The coded line.',
    ]);
  });

  it('omits the cipher line for a discovery that has none, even with Cipher', () => {
    expect(discoveryLines(NOTE_ONLY, true)).toEqual(['Plain', 'No cipher line here.']);
  });
});
