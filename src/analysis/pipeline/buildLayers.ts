import type { Feature, FeatureCollection, MultiLineString, MultiPolygon, Point } from 'geojson';
import { computeContourLevels, trimmedRange } from '../stats/colorScale';
import type {
  CategorisedCells,
  CleanBath,
  ColorScaleOptions,
  LayerBundle,
  ScaleRange,
  ScanCategory,
} from '../types';
import { buildContourFeatures } from './contours';
import { buildIdwGrid } from './grid';

const FALLBACK_SCALE = { min: 0, max: 1 } as const;
const BATHYMETRY_GRID_M = 1;
const WEED_GRID_M = 2;
const BATHYMETRY_CONTOUR_LEVELS = 12;
const WEED_CONTOUR_LEVELS = 8;
const FISH_DENSITY_COLOR_STOPS = 9;
const IDW_K_NEAREST = 4;
const IDW_RADIUS_M = 5;
const METRES_PER_DEG_LAT = 111000;

type SweetSpotCategory = Exclude<ScanCategory, 'none'>;

const SWEET_SPOT_COLOURS: Record<SweetSpotCategory, string> = {
  gold: '#FFD700',
  silver: '#7CB342',
  bronze: '#1976D2',
  weeded: '#FB8C00',
};

function emptyFc(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function safeScale(values: readonly number[], trimPct: number, n: number): ScaleRange {
  if (values.length === 0) {
    return { min: FALLBACK_SCALE.min, max: FALLBACK_SCALE.max, levels: [] };
  }
  const { min, max } = trimmedRange(values, trimPct);
  // Only feed values within the trimmed range into level computation so the
  // colour stops align with the legend's declared min/max. Without this,
  // tail outliers (e.g. residual lift-outs that survive detectLiftouts)
  // push level values beyond `max`, and the legend's "max colour" no longer
  // corresponds to the actual `max` shown in the legend label.
  const inRange = values.filter((v) => v >= min && v <= max);
  const levels = computeContourLevels(inRange, n);
  return { min, max, levels };
}

interface ProjectionAnchor {
  lat0: number;
  lon0: number;
  meanLat: number;
}

function projectionFromCleanBath(clean: CleanBath): ProjectionAnchor {
  let minLat = Infinity;
  let minLon = Infinity;
  let sumLat = 0;
  for (const r of clean.rows) {
    if (r.lat < minLat) minLat = r.lat;
    if (r.lon < minLon) minLon = r.lon;
    sumLat += r.lat;
  }
  return {
    lat0: minLat,
    lon0: minLon,
    meanLat: clean.rows.length > 0 ? sumLat / clean.rows.length : 0,
  };
}

function projectionFromCells(cells: CategorisedCells): ProjectionAnchor {
  // origin is (min lat, min lon) per aggregateCells, but the forward
  // projection used cos(actual mean lat) — see aggregateCells.ts:21. Recompute
  // the mean from the cell rows so the inverse projection here uses the same
  // cosine factor.
  let sumLat = 0;
  for (const r of cells.rows) sumLat += r.lat;
  const meanLat = cells.rows.length > 0 ? sumLat / cells.rows.length : cells.origin.lat;
  return {
    lat0: cells.origin.lat,
    lon0: cells.origin.lon,
    meanLat,
  };
}

function buildBathymetryContours(clean: CleanBath, scale: ScaleRange): FeatureCollection {
  if (clean.rows.length === 0) return emptyFc();
  const anchor = projectionFromCleanBath(clean);
  const lonMetresPerDeg = METRES_PER_DEG_LAT * Math.cos((anchor.meanLat * Math.PI) / 180);

  const points = clean.rows.map((r) => ({
    x: (r.lon - anchor.lon0) * lonMetresPerDeg,
    y: (r.lat - anchor.lat0) * METRES_PER_DEG_LAT,
    v: r.depth_m,
  }));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const grid = buildIdwGrid(points, {
    cellSize: BATHYMETRY_GRID_M,
    kNearest: IDW_K_NEAREST,
    radius: IDW_RADIUS_M,
    minX,
    minY,
    maxX,
    maxY,
  });

  const fc = buildContourFeatures(grid, scale.levels);

  // Reproject from grid (metres) coordinates to [lon, lat].
  const features: Feature<MultiPolygon, { level: number }>[] = fc.features.map((f) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'MultiPolygon' as const,
      coordinates: f.geometry.coordinates.map((poly) =>
        poly.map((ring) =>
          ring.map(([xm, ym]) => [
            anchor.lon0 + (xm ?? 0) / lonMetresPerDeg,
            anchor.lat0 + (ym ?? 0) / METRES_PER_DEG_LAT,
          ]),
        ),
      ),
    },
    properties: { level: f.properties.level },
  }));

  return { type: 'FeatureCollection', features };
}

function buildWeedContours(cells: CategorisedCells, scale: ScaleRange): FeatureCollection {
  if (cells.rows.length === 0) return emptyFc();
  const anchor = projectionFromCells(cells);
  const lonMetresPerDeg = METRES_PER_DEG_LAT * Math.cos((anchor.meanLat * Math.PI) / 180);

  const points = cells.rows.map((c) => ({
    x: c.cx,
    y: c.cy,
    v: c.mean_weed,
  }));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const grid = buildIdwGrid(points, {
    cellSize: WEED_GRID_M,
    kNearest: IDW_K_NEAREST,
    radius: IDW_RADIUS_M,
    minX,
    minY,
    maxX,
    maxY,
  });

  const fc = buildContourFeatures(grid, scale.levels);

  const features: Feature<MultiPolygon, { level: number }>[] = fc.features.map((f) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'MultiPolygon' as const,
      coordinates: f.geometry.coordinates.map((poly) =>
        poly.map((ring) =>
          ring.map(([xm, ym]) => [
            anchor.lon0 + (xm ?? 0) / lonMetresPerDeg,
            anchor.lat0 + (ym ?? 0) / METRES_PER_DEG_LAT,
          ]),
        ),
      ),
    },
    properties: { level: f.properties.level },
  }));

  return { type: 'FeatureCollection', features };
}

/**
 * Convert a `MultiPolygon` FeatureCollection into a `MultiLineString`
 * FeatureCollection by extracting each ring of every polygon as a single
 * line. Used to render bathymetry contours as thin lines when weed is also
 * visible — keeps the contour shape and colour ramp without an opaque fill
 * blocking the weed colours underneath.
 */
function polygonsToLines(fc: FeatureCollection): FeatureCollection {
  const features: Feature<MultiLineString, { level: number }>[] = [];
  for (const f of fc.features) {
    if (f.geometry.type !== 'MultiPolygon') continue;
    const lines: number[][][] = [];
    for (const polygon of f.geometry.coordinates) {
      for (const ring of polygon) {
        lines.push(ring);
      }
    }
    if (lines.length === 0) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'MultiLineString', coordinates: lines },
      properties: { level: (f.properties?.level as number) ?? 0 },
    });
  }
  return { type: 'FeatureCollection', features };
}

function buildFishDensity(cells: CategorisedCells): FeatureCollection {
  const features: Feature<Point, { fish_rate: number; n_pings: number }>[] = [];
  for (const c of cells.rows) {
    if (c.fish_rate <= 0) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
      properties: { fish_rate: c.fish_rate, n_pings: c.n_pings },
    });
  }
  return { type: 'FeatureCollection', features };
}

interface SweetSpotProps {
  category: SweetSpotCategory;
  color: string;
  n_pings: number;
  fish_rate: number;
  mean_weed: number;
}

function computeTempStats(clean: CleanBath): LayerBundle['tempStats'] {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let n = 0;
  for (const r of clean.rows) {
    if (r.temp_c === undefined) continue;
    if (r.temp_c < min) min = r.temp_c;
    if (r.temp_c > max) max = r.temp_c;
    sum += r.temp_c;
    n++;
  }
  return n === 0 ? null : { min, mean: sum / n, max };
}

function computeBounds(clean: CleanBath): LayerBundle['bounds'] {
  if (clean.rows.length === 0) return null;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const r of clean.rows) {
    if (r.lon < minLon) minLon = r.lon;
    if (r.lon > maxLon) maxLon = r.lon;
    if (r.lat < minLat) minLat = r.lat;
    if (r.lat > maxLat) maxLat = r.lat;
  }
  return { sw: [minLon, minLat], ne: [maxLon, maxLat] };
}

function buildSweetSpots(cells: CategorisedCells): FeatureCollection {
  const features: Feature<Point, SweetSpotProps>[] = [];
  for (const c of cells.rows) {
    if (c.category === 'none') continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
      properties: {
        category: c.category,
        color: SWEET_SPOT_COLOURS[c.category],
        n_pings: c.n_pings,
        fish_rate: c.fish_rate,
        mean_weed: c.mean_weed,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function buildLayers(
  clean: CleanBath,
  cells: CategorisedCells,
  colorScale: ColorScaleOptions,
): LayerBundle {
  const depths = clean.rows.map((r) => r.depth_m);
  const weeds = cells.rows.map((c) => c.mean_weed);
  const fishRates = cells.rows.map((c) => c.fish_rate);

  const scales = {
    depth: safeScale(depths, colorScale.outlierTrimPct, BATHYMETRY_CONTOUR_LEVELS),
    weed: safeScale(weeds, colorScale.outlierTrimPct, WEED_CONTOUR_LEVELS),
    fishRate: safeScale(fishRates, colorScale.outlierTrimPct, FISH_DENSITY_COLOR_STOPS),
    temperature: { min: 0, max: 1, levels: [] as number[] },
  };

  const weed = buildWeedContours(cells, scales.weed);
  const bathymetry = buildBathymetryContours(clean, scales.depth);
  const bathymetryLines = polygonsToLines(bathymetry);

  return {
    bathymetry,
    weed,
    bathymetryLines,
    fishDensity: buildFishDensity(cells),
    sweetSpots: buildSweetSpots(cells),
    temperature: emptyFc(),
    scales,
    bounds: computeBounds(clean),
    tempStats: computeTempStats(clean),
  };
}
