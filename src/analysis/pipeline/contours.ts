import { contours } from 'd3-contour';
import type { Feature, FeatureCollection, MultiPolygon } from 'geojson';
import polygonClipping from 'polygon-clipping';
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

/**
 * Convert d3-contour's nested MultiPolygon features (where each level covers
 * value >= threshold) into exclusive annular bands so each grid pixel is
 * covered by exactly one polygon.
 *
 * The input features must be sorted by level ascending (d3-contour always
 * produces them in that order). Each level k polygon is clipped by subtracting
 * the next higher level's polygon from it, producing a ring (possibly with
 * holes). The highest level is left unchanged.
 */
export function toExclusiveBands(
  fc: FeatureCollection<MultiPolygon, { level: number }>,
): FeatureCollection<MultiPolygon, { level: number }> {
  const sorted = [...fc.features].sort((a, b) => a.properties.level - b.properties.level);
  const out: Feature<MultiPolygon, { level: number }>[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i]!;

    // Highest level: pass through unchanged.
    if (i === sorted.length - 1) {
      out.push(f);
      continue;
    }

    const next = sorted[i + 1]!;

    // polygon-clipping expects Polygon | MultiPolygon in its own Pair-based
    // coordinate format. GeoJSON [number, number][] is structurally compatible.
    const diff = polygonClipping.difference(
      f.geometry.coordinates as unknown as polygonClipping.MultiPolygon,
      next.geometry.coordinates as unknown as polygonClipping.MultiPolygon,
    );

    // Nothing left after subtraction — skip this level.
    if (diff.length === 0) continue;

    out.push({
      type: 'Feature',
      geometry: {
        type: 'MultiPolygon',
        coordinates: diff,
      },
      properties: { level: f.properties.level },
    });
  }

  return { type: 'FeatureCollection', features: out };
}
