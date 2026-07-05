// 4-directional BFS shortest-path finder over a passable-tile grid.
// Pure logic only -- no Phaser imports.

export interface PathNode {
  readonly x: number;
  readonly y: number;
}

export interface PathInput {
  readonly width: number;
  readonly height: number;
  /** Whether a tile can be entered. The caller bakes in any unlock state. */
  readonly isPassable: (x: number, y: number) => boolean;
  readonly start: PathNode;
  readonly goal: PathNode;
}

export interface PathResult {
  readonly reachable: boolean;
  /** Step count from start to goal; 0 if start === goal; -1 if unreachable. */
  readonly distance: number;
  /** start..goal inclusive; empty array if unreachable. */
  readonly path: readonly PathNode[];
}

// Deterministic neighbour order: up, down, left, right.
const NEIGHBOURS: readonly [number, number][] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

/** Convert (x, y) to a flat index key for Maps and arrays. */
function key(x: number, y: number, width: number): number {
  return y * width + x;
}

export function findPath(input: PathInput): PathResult {
  const { width, height, isPassable, start, goal } = input;

  const UNREACHABLE: PathResult = { reachable: false, distance: -1, path: [] };

  // Validate start and goal are in bounds.
  if (
    start.x < 0 || start.x >= width ||
    start.y < 0 || start.y >= height ||
    goal.x < 0 || goal.x >= width ||
    goal.y < 0 || goal.y >= height
  ) {
    return UNREACHABLE;
  }

  // Start or goal not passable means no valid path.
  if (!isPassable(start.x, start.y) || !isPassable(goal.x, goal.y)) {
    return UNREACHABLE;
  }

  // Trivial case: start equals goal.
  if (start.x === goal.x && start.y === goal.y) {
    return { reachable: true, distance: 0, path: [{ x: start.x, y: start.y }] };
  }

  // BFS using a flat-index parent map.
  // parent[k] = flat index of the tile that discovered tile k.
  // Use -1 as sentinel for "no parent / not visited".
  const parent = new Int32Array(width * height).fill(-1);
  const startKey = key(start.x, start.y, width);
  const goalKey = key(goal.x, goal.y, width);

  // Mark start as visited with itself as parent (sentinel for path reconstruction).
  parent[startKey] = startKey;

  const queue: number[] = [startKey];
  let head = 0;

  while (head < queue.length) {
    const currentKey = queue[head];
    // Guard: currentKey is always a valid index by construction.
    if (currentKey === undefined) break;
    head += 1;

    if (currentKey === goalKey) break;

    const cx = currentKey % width;
    const cy = Math.floor(currentKey / width);

    for (const delta of NEIGHBOURS) {
      // Guard: NEIGHBOURS is a fixed readonly tuple, indices always valid.
      if (delta === undefined) continue;
      const [dx, dy] = delta;

      const nx = cx + dx;
      const ny = cy + dy;

      // Bounds check.
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const nk = key(nx, ny, width);

      // Already visited.
      // Guard: nk is in-bounds so parent[nk] is defined as Int32Array always returns number.
      if (parent[nk] !== -1) continue;

      // Passability check.
      if (!isPassable(nx, ny)) continue;

      parent[nk] = currentKey;
      queue.push(nk);
    }
  }

  // Check if goal was reached.
  // Guard: goalKey is in-bounds, parent is Int32Array.
  if (parent[goalKey] === -1) {
    return UNREACHABLE;
  }

  // Reconstruct path by walking parent pointers from goal back to start.
  const reversed: PathNode[] = [];
  let current = goalKey;

  while (current !== startKey) {
    const x = current % width;
    const y = Math.floor(current / width);
    reversed.push({ x, y });

    const p = parent[current];
    // Guard: we know current is reachable from start, so parent is never -1 here.
    if (p === undefined || p === -1) break;
    current = p;
  }

  // Push the start node.
  reversed.push({ x: start.x, y: start.y });
  reversed.reverse();

  return {
    reachable: true,
    distance: reversed.length - 1,
    path: reversed,
  };
}
