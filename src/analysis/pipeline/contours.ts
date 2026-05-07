import { contours } from 'd3-contour';
import type { Feature, FeatureCollection, MultiPolygon } from 'geojson';
import type { IdwGrid } from './grid';

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
          ring.map((pt) => {
            // d3-contour always emits 2D points, but the @types/d3-contour
            // signature widens to number[]; assert the pair we know we have.
            const [gx, gy] = pt as [number, number];
            return [grid.origin.x + gx * grid.cellSize, grid.origin.y + gy * grid.cellSize];
          }),
        ),
      ),
    },
    properties: { level: p.value },
  }));

  return { type: 'FeatureCollection', features };
}
