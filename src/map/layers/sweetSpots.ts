import type { Feature, FeatureCollection, Point } from 'geojson';
import type { LayerStyle } from './bathymetry';
import type maplibregl from 'maplibre-gl';

export const SWEET_SPOTS_SOURCE_ID = 'sweet-spots';
export const SWEET_SPOTS_LAYER_ID = 'sweet-spots-circles';

/** A lon/lat rectangle — the map's current visible extent. */
export interface SweetSpotViewport {
  west: number;
  south: number;
  east: number;
  north: number;
}

// Best-first ordering of sweet-spot categories. Unknown categories sort last.
const CATEGORY_RANK: Record<string, number> = { gold: 0, silver: 1, bronze: 2, weeded: 3 };

function categoryRank(category: unknown): number {
  return typeof category === 'string' && category in CATEGORY_RANK
    ? CATEGORY_RANK[category]!
    : Number.MAX_SAFE_INTEGER;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function isPointFeature(f: Feature): f is Feature<Point> {
  return f.geometry?.type === 'Point';
}

/**
 * Pick the best `limit` sweet spots that fall within `viewport`.
 *
 * A busy lake can produce hundreds of sweet-spot cells; showing them all is
 * unreadable. This keeps only those in the visible extent, ranks them
 * best-first (gold → silver → bronze → weeded, then higher fish-rate, then less
 * weed, then more pings for confidence), and returns at most `limit` of them.
 * Recomputed as the user pans/zooms, so the map always shows the strongest
 * candidates for wherever they're looking rather than an arbitrary subset.
 *
 * Pure and MapLibre-free so it can be unit-tested without a WebGL context.
 */
export function selectTopSweetSpots(
  fc: FeatureCollection,
  viewport: SweetSpotViewport,
  limit: number,
): FeatureCollection {
  if (limit <= 0) return { type: 'FeatureCollection', features: [] };

  const inView = fc.features.filter((f): f is Feature<Point> => {
    if (!isPointFeature(f)) return false;
    const lon = f.geometry.coordinates[0];
    const lat = f.geometry.coordinates[1];
    if (lon === undefined || lat === undefined) return false;
    return (
      lon >= viewport.west && lon <= viewport.east && lat >= viewport.south && lat <= viewport.north
    );
  });

  inView.sort((a, b) => {
    const ra = categoryRank(a.properties?.category);
    const rb = categoryRank(b.properties?.category);
    if (ra !== rb) return ra - rb;
    const fr = num(b.properties?.fish_rate) - num(a.properties?.fish_rate);
    if (fr !== 0) return fr;
    const weed = num(a.properties?.mean_weed) - num(b.properties?.mean_weed);
    if (weed !== 0) return weed;
    return num(b.properties?.n_pings) - num(a.properties?.n_pings);
  });

  return { type: 'FeatureCollection', features: inView.slice(0, limit) };
}

export function buildSweetSpotsStyle(): LayerStyle {
  return {
    source: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    },
    layer: {
      id: SWEET_SPOTS_LAYER_ID,
      type: 'circle',
      source: SWEET_SPOTS_SOURCE_ID,
      paint: {
        'circle-radius': 8,
        'circle-color': ['get', 'color'] as unknown as maplibregl.ExpressionSpecification,
        'circle-opacity': 1,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
      },
      layout: { visibility: 'visible' },
    } as unknown as maplibregl.LayerSpecification,
  };
}
