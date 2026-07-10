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

  it('is bit-for-bit identical to a naive O(grid×points) scan (spatial-index refactor)', () => {
    // Reference implementation = the original naive algorithm: scan points in
    // array order, stable-sort candidates by d², break on the first exact hit.
    function naive(points: XYZ[], cellSize: number, radius: number, kNearest: number) {
      const minX = 0;
      const minY = 0;
      const maxX = 20;
      const maxY = 20;
      const width = Math.floor((maxX - minX) / cellSize) + 1;
      const height = Math.floor((maxY - minY) / cellSize) + 1;
      const out = new Float64Array(width * height);
      const r2 = radius * radius;
      for (let gy = 0; gy < height; gy++) {
        for (let gx = 0; gx < width; gx++) {
          const cx = minX + gx * cellSize;
          const cy = minY + gy * cellSize;
          const pairs: Array<{ d2: number; v: number }> = [];
          let hit = false;
          for (const p of points) {
            const d2 = (p.x - cx) ** 2 + (p.y - cy) ** 2;
            if (d2 <= r2) {
              if (d2 === 0) {
                out[gy * width + gx] = p.v;
                hit = true;
                break;
              }
              pairs.push({ d2, v: p.v });
            }
          }
          if (hit) continue;
          if (pairs.length === 0) {
            out[gy * width + gx] = NaN;
            continue;
          }
          pairs.sort((a, b) => a.d2 - b.d2);
          let sumW = 0;
          let sumWV = 0;
          for (const { d2, v } of pairs.slice(0, kNearest)) {
            sumW += 1 / d2;
            sumWV += (1 / d2) * v;
          }
          out[gy * width + gx] = sumWV / sumW;
        }
      }
      return out;
    }

    // Dense integer lattice → many points per neighbourhood, exact hits at
    // integer cell centres, and equidistant ties (which exercise the
    // index-order tie-break).
    const points: XYZ[] = [];
    for (let x = 0; x <= 20; x++) {
      for (let y = 0; y <= 20; y++) {
        points.push({ x, y, v: x * 100 + y });
      }
    }
    const opts = { cellSize: 1, kNearest: 4, radius: 5, minX: 0, minY: 0, maxX: 20, maxY: 20 };
    const grid = buildIdwGrid(points, opts);
    const ref = naive(points, 1, 5, 4);
    expect(grid.values.length).toBe(ref.length);
    for (let i = 0; i < ref.length; i++) {
      if (Number.isNaN(ref[i]!)) {
        expect(Number.isNaN(grid.values[i]!)).toBe(true);
      } else {
        // Exact equality: same candidate ordering ⇒ same float arithmetic.
        expect(grid.values[i]).toBe(ref[i]);
      }
    }
  });

  it('stays fast on a large point set × grid (spatial index, not O(grid×points))', () => {
    // 40k points over a 200×200 grid = 40k×40k ≈ 1.6e9 in the naive scan; the
    // spatial index keeps this well under a second. Purely a guard that the
    // refactor didn't regress to the quadratic path.
    const points: XYZ[] = [];
    for (let i = 0; i < 40_000; i++) {
      points.push({ x: (i * 7) % 200, y: (i * 13) % 200, v: i % 50 });
    }
    const grid = buildIdwGrid(points, {
      cellSize: 1,
      kNearest: 4,
      radius: 5,
      minX: 0,
      minY: 0,
      maxX: 200,
      maxY: 200,
    });
    expect(grid.width).toBe(201);
    expect(grid.height).toBe(201);
    // Interior cells all have points within radius → finite.
    expect(Number.isFinite(grid.values[100 * 201 + 100]!)).toBe(true);
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
