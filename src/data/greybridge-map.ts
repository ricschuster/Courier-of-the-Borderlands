// Grey-box tile map for the Greybridge Region.
//
// The region is split top to bottom by a river (water) that only three
// crossings span: an open northern bridge, the main central bridge, and a
// southern ford that starts blocked and opens as an unlockable shortcut. The
// road network forms loops rather than a single line, so there is usually more
// than one way across and the player has real routes to choose between.
//
// Legend:
//   . plains    f forest   # road      h hills
//   b bridge    ~ water    ^ mountain   m marsh   M deep-mire (wagon-gated)
//   x ford (locked shortcut)
//
// Landmarks (col,row):
//   Greywater  (2,8)   home town on the main road, far west
//   Northcairn (5,3)   hill-clan settlement on the northern road
//   Ironhollow (4,18)  mining hollow in the south-west mountains
//   Eastwatch  (19,8)  watchtower on the main road, east of the river
//   Southmill  (21,14) mill on the south-east reeds
//   Fenmarch gateway (21,18) southern terminus of the east-bank road, off Southmill
//   Mirewatch  (24,20) stilt-village off the road, deep in the south-east marsh
//              (reached only by wading south through the reeds from the row-18 road)
//   Reedgrave  (28,19) drowned cairn in the far south-east reeds, walled off by a
//              black channel (col 16-21 at column 26). A single deep-mire tile at
//              (26,19) is the short way across, opened by the Marsh Treads upgrade
//              or an off-road skill; without it the reeds are reached the long way
//              round the north end of the channel (via row 15). See
//              docs/design/07_roads_gate_the_wagon.md.
// Crossings: north bridge row 3, main bridge row 8, ford row 14 (cols 14-15).
// The ford signpost sits at (13,14) on the west bank and unlocks the ford.
//
// Grid is 30 wide by 22 tall. createTileMap validates row lengths and symbols.

export const GREYBRIDGE_LEGEND: Readonly<Record<string, string>> = {
  '.': 'plains',
  f: 'forest',
  '#': 'road',
  b: 'bridge',
  '~': 'water',
  '^': 'mountain',
  h: 'hills',
  m: 'marsh',
  M: 'deep-mire',
  x: 'ford-greybridge',
};

export const GREYBRIDGE_ROWS: readonly string[] = [
  'hhhhhhh.......~~....ffffffff..',
  'hhhhhh........~~.....fffffff..',
  'hhhhhhh.......~~......ffffff..',
  'hhhhh#########bb#########fff..',
  'hhhhh#hffffff.~~....ffff#fff..',
  '.....#.ffffff.~~........#.....',
  '.....#..ffff..~~........#.....',
  '.....#.ffffff.~~........#.....',
  '##############bb##############',
  '.....#.ffffff.~~.....#........',
  '.....#..ffff..~~.....#........',
  '.....#.ffffff.~~.....#........',
  '.....#...fff..~~.....#........',
  '.....#.ffffff.~~.....#........',
  '.....#########xx######........',
  '^^^^^#^^^^....~~mmmmm#mmmmmmmm',
  '^^^^^#^^^^....~~mmmmm#mmmm~mmm',
  '^^^^^#^^^^....~~mmmmm#mmmm~mmm',
  '^^^^##^^^^....~~mmmmm#####~mmm',
  '^^^^^^^^^^....~~mmmmmmmmmmMmmm',
  '^^^^^^^^^.....~~mmmmmmmmmm~mmm',
  '^^^^^^^^......~~mmmmmmmmmm~mmm',
];
