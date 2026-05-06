import { contours } from 'd3-contour';
import type { Feature, FeatureCollection, MultiPolygon } from 'geojson';
import type { ScaleRange } from '../types';
import type { IdwGrid } from './grid';

/**
 * Evenly-spaced contour levels between min and max.
 * For a degenerate range (min == max), returns N identical values so callers
 * can still produce a (possibly empty) FeatureCollection without crashing.
 */
export function computeContourLevels(range: ScaleRange, n: number): number[] {
  const out: number[] = [];
  if (range.max === range.min) {
    for (let i = 0; i < n; i++) out.push(range.min);
    return out;
  }
  const step = (range.max - range.min) / (n - 1);
  for (let i = 0; i < n; i++) out.push(range.min + i * step);
  return out;
}

interface D3MultiPolygon {
  type: 'MultiPolygon';
  value: number;
  coordinates: number[][][][];
}

/**
 * Convert an IDW grid into per-level filled-contour features. Each feature is
 * a GeoJSON MultiPolygon in grid-cell coordinates (caller must reproject to
 * lat/lon before adding to the map).
 *
 * NaN cells in the grid are treated as below-threshold by d3-contour (via the
 * default isovalue compare), so empty regions don't generate spurious contours.
 */
export function buildContourFeatures(
  grid: IdwGrid,
  levels: readonly number[],
): FeatureCollection<MultiPolygon, { level: number }> {
  const flat = Array.from(grid.values).map((v) => (Number.isNaN(v) ? -Infinity : v));
  const generator = contours().size([grid.width, grid.height]).thresholds(levels.slice());
  const polygons = generator(flat) as unknown as D3MultiPolygon[];

  const features: Feature<MultiPolygon, { level: number }>[] = polygons.map((p) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'MultiPolygon' as const,
      coordinates: p.coordinates.map((poly) =>
        poly.map((ring) =>
          ring.map(([gx, gy]) => [
            grid.origin.x + (gx ?? 0) * grid.cellSize,
            grid.origin.y + (gy ?? 0) * grid.cellSize,
          ]),
        ),
      ),
    },
    properties: { level: p.value },
  }));

  return { type: 'FeatureCollection', features };
}
