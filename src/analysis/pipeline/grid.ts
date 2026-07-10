export interface XYV {
  x: number;
  y: number;
  v: number;
}

export interface IdwGridOptions {
  cellSize: number;
  kNearest: number;
  radius: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface IdwGrid {
  width: number;
  height: number;
  cellSize: number;
  origin: { x: number; y: number };
  /** Row-major, length = width × height. NaN for cells with no points within radius. */
  values: Float64Array;
}

/**
 * Inverse-distance-weighted grid resample. For each grid cell centre, finds
 * the up-to-K nearest points within `radius` and computes a weighted mean
 * with weights = 1 / d² (power = 2). Cells with no points within radius
 * are NaN, so contour generation can mask out empty regions.
 *
 * Points are bucketed into a uniform spatial hash with bucket size = `radius`,
 * so each grid cell only tests points in its own bucket plus the eight
 * neighbours — every point within `radius` is guaranteed to fall in that 3×3
 * window. This replaces the previous O(grid × points) scan (which spent
 * "ages" and then ran a phone out of memory on a large scan: hundreds of
 * thousands of points × a metre-resolution grid over the whole extent) with
 * roughly O(grid + points). Output is bit-for-bit identical to the naive scan:
 * candidates are ordered by (d², original index), reproducing the old stable
 * sort-by-distance with array-order tie-breaking.
 */
export function buildIdwGrid(points: readonly XYV[], opts: IdwGridOptions): IdwGrid {
  if (points.length === 0) throw new Error('buildIdwGrid: empty point set');

  const width = Math.floor((opts.maxX - opts.minX) / opts.cellSize) + 1;
  const height = Math.floor((opts.maxY - opts.minY) / opts.cellSize) + 1;
  const values = new Float64Array(width * height);
  const radius2 = opts.radius * opts.radius;

  // Spatial hash keyed by bucket (bx, by). Bucket size = radius so a point
  // within `radius` of a cell centre lands in that cell's bucket or an adjacent
  // one. Guard against a non-positive radius (degenerate; fall back to cellSize).
  const bucketSize = opts.radius > 0 ? opts.radius : opts.cellSize;
  const bucketsWide = Math.floor((opts.maxX - opts.minX) / bucketSize) + 1;
  const bucketsHigh = Math.floor((opts.maxY - opts.minY) / bucketSize) + 1;
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const bx = Math.floor((p.x - opts.minX) / bucketSize);
    const by = Math.floor((p.y - opts.minY) / bucketSize);
    const key = by * bucketsWide + bx;
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(i);
  }

  // Reused per-cell scratch buffer for candidate (d², index) pairs.
  const cand: Array<{ d2: number; idx: number }> = [];

  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const cx = opts.minX + gx * opts.cellSize;
      const cy = opts.minY + gy * opts.cellSize;
      const bcx = Math.floor((cx - opts.minX) / bucketSize);
      const bcy = Math.floor((cy - opts.minY) / bucketSize);

      cand.length = 0;
      // Clamp the 3×3 bucket window to valid bucket indices. Points never lie
      // outside [minX,maxX]×[minY,maxY], so out-of-range buckets hold nothing;
      // clamping also keeps the flat key `by*bucketsWide+bx` collision-free
      // (negative bx would otherwise alias onto a different row's bucket).
      const byLo = Math.max(0, bcy - 1);
      const byHi = Math.min(bucketsHigh - 1, bcy + 1);
      const bxLo = Math.max(0, bcx - 1);
      const bxHi = Math.min(bucketsWide - 1, bcx + 1);
      for (let by = byLo; by <= byHi; by++) {
        for (let bx = bxLo; bx <= bxHi; bx++) {
          const arr = buckets.get(by * bucketsWide + bx);
          if (!arr) continue;
          for (const idx of arr) {
            const p = points[idx]!;
            const dx = p.x - cx;
            const dy = p.y - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 <= radius2) cand.push({ d2, idx });
          }
        }
      }

      if (cand.length === 0) {
        values[gy * width + gx] = NaN;
        continue;
      }

      // Order by distance, breaking ties by original array index — identical
      // to the old stable sort over points scanned in array order.
      cand.sort((a, b) => a.d2 - b.d2 || a.idx - b.idx);

      // Exact match short-circuits to the point's value (matches the naive
      // scan's break on the first zero-distance point).
      if (cand[0]!.d2 === 0) {
        values[gy * width + gx] = points[cand[0]!.idx]!.v;
        continue;
      }

      const kMax = Math.min(opts.kNearest, cand.length);
      let sumW = 0;
      let sumWV = 0;
      for (let j = 0; j < kMax; j++) {
        const { d2, idx } = cand[j]!;
        const w = 1 / d2;
        sumW += w;
        sumWV += w * points[idx]!.v;
      }
      values[gy * width + gx] = sumWV / sumW;
    }
  }

  return {
    width,
    height,
    cellSize: opts.cellSize,
    origin: { x: opts.minX, y: opts.minY },
    values,
  };
}
