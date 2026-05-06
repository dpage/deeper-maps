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
 * Naive O(grid × points) implementation — fine for our scale (<100k points,
 * <10k grid cells). Replace with a spatial index if a real performance issue
 * surfaces.
 */
export function buildIdwGrid(points: readonly XYV[], opts: IdwGridOptions): IdwGrid {
  if (points.length === 0) throw new Error('buildIdwGrid: empty point set');

  const width = Math.floor((opts.maxX - opts.minX) / opts.cellSize) + 1;
  const height = Math.floor((opts.maxY - opts.minY) / opts.cellSize) + 1;
  const values = new Float64Array(width * height);
  const radius2 = opts.radius * opts.radius;

  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const cx = opts.minX + gx * opts.cellSize;
      const cy = opts.minY + gy * opts.cellSize;

      // Collect (distance², value) pairs within radius.
      const pairs: Array<{ d2: number; v: number }> = [];
      let exactHit = false;
      for (const p of points) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= radius2) {
          if (d2 === 0) {
            // Exact match — short-circuit to the point's value.
            values[gy * width + gx] = p.v;
            exactHit = true;
            break;
          }
          pairs.push({ d2, v: p.v });
        }
      }

      if (exactHit) continue;

      if (pairs.length === 0) {
        values[gy * width + gx] = NaN;
        continue;
      }

      // Take K nearest.
      pairs.sort((a, b) => a.d2 - b.d2);
      const k = pairs.slice(0, opts.kNearest);

      let sumW = 0;
      let sumWV = 0;
      for (const { d2, v } of k) {
        const w = 1 / d2;
        sumW += w;
        sumWV += w * v;
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
