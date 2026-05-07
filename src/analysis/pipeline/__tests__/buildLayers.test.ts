import { describe, expect, it } from 'vitest';
import { DEFAULT_COLOR_SCALE_OPTIONS } from '../../constants';
import type { CategorisedCells, CleanBath } from '../../types';
import { buildLayers } from '../buildLayers';

const emptyClean: CleanBath = { rows: [], sessions: [], liftoutsRemoved: 0 };
const emptyCells: CategorisedCells = { cellSizeM: 2, origin: { lat: 0, lon: 0 }, rows: [] };

describe('buildLayers — empty data', () => {
  it('returns empty FeatureCollections when there is no data', () => {
    const lb = buildLayers(emptyClean, emptyCells, DEFAULT_COLOR_SCALE_OPTIONS);
    expect(lb.bathymetry.features).toHaveLength(0);
    expect(lb.weed.features).toHaveLength(0);
    expect(lb.fishDensity.features).toHaveLength(0);
    expect(lb.sweetSpots.features).toHaveLength(0);
    expect(lb.scales.depth.max - lb.scales.depth.min).toBeGreaterThan(0);
    expect(lb.bounds).toBeNull();
  });
});

describe('buildLayers — bounds', () => {
  it('computes [sw, ne] bounds from clean.rows lon/lat', () => {
    const clean: CleanBath = {
      rows: [
        {
          ts_ms: 0,
          lat: 51.7,
          lon: -1.43,
          depth_m: 1.0,
          session_id: 0,
          file_id: 0,
        },
        {
          ts_ms: 100,
          lat: 51.701,
          lon: -1.428,
          depth_m: 1.5,
          session_id: 0,
          file_id: 0,
        },
        {
          ts_ms: 200,
          lat: 51.6995,
          lon: -1.4315,
          depth_m: 1.2,
          session_id: 0,
          file_id: 0,
        },
      ],
      sessions: [],
      liftoutsRemoved: 0,
    };
    const lb = buildLayers(clean, emptyCells, DEFAULT_COLOR_SCALE_OPTIONS);
    expect(lb.bounds).not.toBeNull();
    expect(lb.bounds?.sw[0]).toBeCloseTo(-1.4315, 5);
    expect(lb.bounds?.sw[1]).toBeCloseTo(51.6995, 5);
    expect(lb.bounds?.ne[0]).toBeCloseTo(-1.428, 5);
    expect(lb.bounds?.ne[1]).toBeCloseTo(51.701, 5);
  });
});

describe('buildLayers — bathymetry contours', () => {
  it('produces 12 contour features when given a meaningful depth gradient', () => {
    const clean: CleanBath = {
      rows: Array.from({ length: 100 }, (_, i) => ({
        ts_ms: i * 100,
        lat: 51.7 + (i % 10) * 0.0001,
        lon: -1.43 + Math.floor(i / 10) * 0.0001,
        depth_m: 1 + ((i % 10) + Math.floor(i / 10)) * 0.1,
        session_id: 0,
        file_id: 0,
      })),
      sessions: [],
      liftoutsRemoved: 0,
    };
    const lb = buildLayers(clean, emptyCells, { outlierTrimPct: 0 });
    expect(lb.bathymetry.features).toHaveLength(12);
    expect(lb.bathymetry.features[0]?.geometry.type).toBe('MultiPolygon');
    // First feature's coordinates are in [lon, lat] order
    const first = lb.bathymetry.features[0];
    if (first?.geometry.type === 'MultiPolygon' && first.geometry.coordinates.length > 0) {
      const sample = first.geometry.coordinates[0]?.[0]?.[0];
      expect(sample?.[0]).toBeCloseTo(-1.43, 2); // lon
      expect(sample?.[1]).toBeCloseTo(51.7, 2); // lat
    }
  });
});

describe('buildLayers — fish density circles', () => {
  it('produces one circle feature per cell with fish_rate > 0', () => {
    const cells: CategorisedCells = {
      cellSizeM: 2,
      origin: { lat: 51.7, lon: -1.43 },
      rows: [
        {
          cx: 0,
          cy: 0,
          lat: 51.7,
          lon: -1.43,
          n_pings: 5,
          mean_depth: 1.5,
          mean_weed: 0.05,
          fish_rate: 0.4,
          bottom_hardness: 1000,
          category: 'gold',
        },
        {
          cx: 2,
          cy: 0,
          lat: 51.7001,
          lon: -1.43,
          n_pings: 8,
          mean_depth: 1.6,
          mean_weed: 0.05,
          fish_rate: 0,
          bottom_hardness: 1000,
          category: 'none',
        },
      ],
    };
    const lb = buildLayers(emptyClean, cells, DEFAULT_COLOR_SCALE_OPTIONS);
    expect(lb.fishDensity.features).toHaveLength(1);
    expect(lb.fishDensity.features[0]?.geometry.type).toBe('Point');
    expect(lb.fishDensity.features[0]?.properties?.fish_rate).toBe(0.4);
    expect(lb.fishDensity.features[0]?.properties?.n_pings).toBe(5);
  });
});

describe('buildLayers — sweet spot markers', () => {
  it('produces one marker per non-none cell with the right category', () => {
    const cells: CategorisedCells = {
      cellSizeM: 2,
      origin: { lat: 51.7, lon: -1.43 },
      rows: [
        {
          cx: 0,
          cy: 0,
          lat: 51.7,
          lon: -1.43,
          n_pings: 5,
          mean_depth: 1.5,
          mean_weed: 0,
          fish_rate: 0.5,
          bottom_hardness: 1000,
          category: 'gold',
        },
        {
          cx: 2,
          cy: 0,
          lat: 51.7001,
          lon: -1.43,
          n_pings: 8,
          mean_depth: 1.5,
          mean_weed: 0.2,
          fish_rate: 0.5,
          bottom_hardness: 1000,
          category: 'weeded',
        },
        {
          cx: 4,
          cy: 0,
          lat: 51.7002,
          lon: -1.43,
          n_pings: 10,
          mean_depth: 1.5,
          mean_weed: 0,
          fish_rate: 0.02,
          bottom_hardness: 1000,
          category: 'none',
        },
      ],
    };
    const lb = buildLayers(emptyClean, cells, DEFAULT_COLOR_SCALE_OPTIONS);
    expect(lb.sweetSpots.features).toHaveLength(2);
    const cats = lb.sweetSpots.features
      .map((f) => f.properties?.category as string | undefined)
      .sort();
    expect(cats).toEqual(['gold', 'weeded']);
  });
});
