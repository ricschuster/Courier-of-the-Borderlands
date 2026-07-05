import { describe, it, expect } from 'vitest';
import { findPath, type PathInput, type PathNode } from '../../src/systems/pathfinding';

// ---------------------------------------------------------------------------
// Helper: build a PathInput from a string[] grid.
// '.' = passable, '#' = wall.
// ---------------------------------------------------------------------------
function makeGrid(rows: readonly string[]): {
  width: number;
  height: number;
  isPassable: (x: number, y: number) => boolean;
} {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;

  function isPassable(x: number, y: number): boolean {
    const row = rows[y];
    if (row === undefined) return false;
    return row[x] === ".";
  }

  return { width, height, isPassable };
}

function input(
  rows: readonly string[],
  start: PathNode,
  goal: PathNode
): PathInput {
  return { ...makeGrid(rows), start, goal };
}

// ---------------------------------------------------------------------------
// Helper: verify that a path is contiguous (each step is 4-adjacent).
// ---------------------------------------------------------------------------
function isContiguous(path: readonly PathNode[]): boolean {
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    if (prev === undefined || curr === undefined) return false;
    const dx = Math.abs(curr.x - prev.x);
    const dy = Math.abs(curr.y - prev.y);
    // Exactly one step in one cardinal direction.
    if (dx + dy !== 1) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("findPath", () => {
  // 5x1 open corridor: (0,0) to (4,0), distance should be 4.
  it("returns correct straight-line distance on an open grid", () => {
    const grid = ["....." ];
    const result = findPath(input(grid, { x: 0, y: 0 }, { x: 4, y: 0 }));

    expect(result.reachable).toBe(true);
    expect(result.distance).toBe(4);
    expect(result.path).toHaveLength(5);
    expect(result.path[0]).toEqual({ x: 0, y: 0 });
    expect(result.path[4]).toEqual({ x: 4, y: 0 });
  });

  // 3x3 grid with a wall forcing a detour.
  //   . . .
  //   . # .
  //   . . .
  // From (0,1) to (2,1): direct route (0,1)->(1,1)->(2,1) is blocked by wall at (1,1).
  // BFS shortest detour goes via row 0 or row 2 -- distance = 4.
  it("routes around a wall", () => {
    const grid = [
      "...",
      ".#.",
      "...",
    ];
    const result = findPath(input(grid, { x: 0, y: 1 }, { x: 2, y: 1 }));

    expect(result.reachable).toBe(true);
    expect(result.distance).toBe(4);
    expect(result.path[0]).toEqual({ x: 0, y: 1 });
    expect(result.path[result.path.length - 1]).toEqual({ x: 2, y: 1 });
    expect(isContiguous(result.path)).toBe(true);
  });

  // Start equals goal.
  it("returns distance 0 when start equals goal", () => {
    const grid = ["..."];
    const result = findPath(input(grid, { x: 1, y: 0 }, { x: 1, y: 0 }));

    expect(result.reachable).toBe(true);
    expect(result.distance).toBe(0);
    expect(result.path).toHaveLength(1);
    expect(result.path[0]).toEqual({ x: 1, y: 0 });
  });

  // Goal surrounded by walls.
  //   . . .
  //   . # .   <- goal is '#' at (1,1)
  //   . . .
  it("returns unreachable when the goal tile is a wall", () => {
    const grid = [
      "...",
      ".#.",
      "...",
    ];
    const result = findPath(input(grid, { x: 0, y: 0 }, { x: 1, y: 1 }));

    expect(result.reachable).toBe(false);
    expect(result.distance).toBe(-1);
    expect(result.path).toHaveLength(0);
  });

  // Goal is passable but fully enclosed by walls.
  //   # # #
  //   # . #
  //   # # #
  // Start is outside the walled region; no way through.
  it("returns unreachable when the goal is walled off from the start", () => {
    const grid = [
      ".....",
      ".###.",
      ".#.#.",
      ".###.",
      ".....",
    ];
    const result = findPath(input(grid, { x: 0, y: 0 }, { x: 2, y: 2 }));

    expect(result.reachable).toBe(false);
    expect(result.distance).toBe(-1);
    expect(result.path).toHaveLength(0);
  });

  // Out-of-bounds neighbours should never be entered.
  // Place start in a corner; path must stay in-bounds.
  it("never visits out-of-bounds tiles", () => {
    const grid = [
      "...",
      "...",
      "...",
    ];
    const result = findPath(input(grid, { x: 0, y: 0 }, { x: 2, y: 2 }));

    expect(result.reachable).toBe(true);
    for (const node of result.path) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThan(3);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThan(3);
    }
  });

  // Returned path begins at start, ends at goal, and is 4-adjacent throughout.
  it("returns a contiguous path from start to goal", () => {
    const grid = [
      ".....",
      ".###.",
      ".....",
      ".###.",
      ".....",
    ];
    const start: PathNode = { x: 0, y: 0 };
    const goal: PathNode = { x: 4, y: 4 };
    const result = findPath(input(grid, start, goal));

    expect(result.reachable).toBe(true);
    expect(result.path[0]).toEqual(start);
    expect(result.path[result.path.length - 1]).toEqual(goal);
    expect(isContiguous(result.path)).toBe(true);
    expect(result.distance).toBe(result.path.length - 1);
  });

  // Start tile is a wall -- unreachable.
  it("returns unreachable when the start tile is a wall", () => {
    const grid = [
      ".#.",
      "...",
    ];
    const result = findPath(input(grid, { x: 1, y: 0 }, { x: 2, y: 0 }));

    expect(result.reachable).toBe(false);
    expect(result.distance).toBe(-1);
    expect(result.path).toHaveLength(0);
  });

  // Single-tile grid where start equals goal.
  it("handles a 1x1 grid where start equals goal", () => {
    const grid = ["."];
    const result = findPath(input(grid, { x: 0, y: 0 }, { x: 0, y: 0 }));

    expect(result.reachable).toBe(true);
    expect(result.distance).toBe(0);
    expect(result.path).toEqual([{ x: 0, y: 0 }]);
  });
});
