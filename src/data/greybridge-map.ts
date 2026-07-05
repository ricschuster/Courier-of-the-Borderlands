// Grey-box tile map for the Greybridge Region.
//
// The region is split by a river (water) running top to bottom, crossed by a
// single bridge road. This sets up later build steps: terrain movement costs,
// a blocked/difficult crossing, and an unlockable shortcut. For now it is just
// data to render.
//
// Legend:
//   . plains    f forest   # road
//   b bridge    ~ water    ^ mountain    x ford (locked shortcut)
//
// The bridge on row 5 is the only initial crossing. The ford on row 8 is a
// second crossing that starts blocked and opens once unlocked, giving a
// shorter southern route.
//
// Grid is 20 wide by 11 tall. createTileMap validates row lengths and symbols.

export const GREYBRIDGE_LEGEND: Readonly<Record<string, string>> = {
  '.': 'plains',
  f: 'forest',
  '#': 'road',
  b: 'bridge',
  '~': 'water',
  '^': 'mountain',
  x: 'ford',
};

export const GREYBRIDGE_ROWS: readonly string[] = [
  '....ff...~~...^^....',
  '...fff...~~....^^...',
  '..fff....~~.....^...',
  '.f.......~~.........',
  '.........~~.........',
  '#########bb#########',
  '.........~~.........',
  '....f....~~...ff....',
  '...ff....xx..fff....',
  '..^^.....~~.fff.....',
  '.^^^.....~~ff.......',
];
