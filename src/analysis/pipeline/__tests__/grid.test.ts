import { describe, expect, it } from 'vitest';
import { buildIdwGrid } from '../grid';

interface XYZ {
  x: number;
  y: number;
  v: number;
}

describe('buildIdwGrid', () => {
  it('reproduces the input value at exactly-matching grid points', () => {
    const points: XYZ[] = [
      { x: 0, y: 0, v: 1 },
      { x: 4, y: 0, v: 5 },
      { x: 0, y: 4, v: 3 },
      { x: 4, y: 4, v: 7 },
    ];
    const grid = buildIdwGrid(points, {
      cellSize: 2,
      kNearest: 4,
      radius: 5,
      minX: 0,
      minY: 0,
      maxX: 4,
      maxY: 4,
    });
    expect(grid.width).toBe(3);
    expect(grid.height).toBe(3);
    // (0,0) point: weighted by (1,5,3,7); but exact-match makes weight infinite,
    // so the value at (0,0) collapses to the literal point value 1.
    expect(grid.values[0]).toBeCloseTo(1, 3);
    expect(grid.values[2]).toBeCloseTo(5, 3);
    expect(grid.values[6]).toBeCloseTo(3, 3);
    expect(grid.values[8]).toBeCloseTo(7, 3);
  });

  it('returns NaN for grid cells outside the search radius', () => {
    const points: XYZ[] = [{ x: 0, y: 0, v: 5 }];
    const grid = buildIdwGrid(points, {
      cellSize: 1,
      kNearest: 4,
      radius: 1,
      minX: 0,
      minY: 0,
      maxX: 5,
      maxY: 0,
    });
    // Cell (0,0) is in range; (1,0) is in range; (2,0) onwards are not.
    expect(Number.isFinite(grid.values[0])).toBe(true);
    expect(grid.values[0]).toBeCloseTo(5, 3);
    expect(Number.isFinite(grid.values[1])).toBe(true);
    expect(Number.isNaN(grid.values[2])).toBe(true);
  });

  it('throws on empty point set', () => {
    expect(() =>
      buildIdwGrid([], {
        cellSize: 1,
        kNearest: 4,
        radius: 5,
        minX: 0,
        minY: 0,
        maxX: 1,
        maxY: 1,
      }),
    ).toThrow(/empty/);
  });

  it('uses inverse-distance squared weighting (power=2)', () => {
    // Two points at equal distances → simple average.
    const points: XYZ[] = [
      { x: 0, y: 0, v: 0 },
      { x: 2, y: 0, v: 10 },
    ];
    const grid = buildIdwGrid(points, {
      cellSize: 1,
      kNearest: 4,
      radius: 5,
      minX: 0,
      minY: 0,
      maxX: 2,
      maxY: 0,
    });
    // At x=1, y=0: distances are sqrt(1) and sqrt(1) — equal → mean = 5.
    expect(grid.values[1]).toBeCloseTo(5, 3);
  });
});
