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
    expect(lb.bathymetryLines.features).toHaveLength(0);
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

  it('carries the interpolated depth grid through for the 3D view', () => {
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
    const grid = lb.depthGrid;
    expect(grid).not.toBeNull();
    expect(grid!.values).toBeInstanceOf(Float32Array);
    expect(grid!.values.length).toBe(grid!.width * grid!.height);
    expect(grid!.width).toBeGreaterThan(1);
    expect(grid!.height).toBeGreaterThan(1);
    // The anchor must reproject grid metres back to the scan's real-world corner.
    expect(grid!.anchor.lon0).toBeCloseTo(-1.43, 5);
    expect(grid!.anchor.lat0).toBeCloseTo(51.7, 5);
    expect(grid!.anchor.latMetresPerDeg).toBeGreaterThan(0);
    // At least one grid cell carries a real (non-NaN) sounding.
    expect(Array.from(grid!.values).some((v) => !Number.isNaN(v))).toBe(true);
  });

  it('leaves depthGrid null for an empty scan', () => {
    const lb = buildLayers(emptyClean, emptyCells, DEFAULT_COLOR_SCALE_OPTIONS);
    expect(lb.depthGrid ?? null).toBeNull();
  });

  it('coarsens the grid (does not blow up) for a scan spanning a huge area', () => {
    // A track spread over ~2 km × 2 km would be > 4,000,000 cells at 1 m — past
    // MAX_CONTOUR_GRID_CELLS. Exercises fitCellSize's coarsening branch and
    // proves buildLayers completes instead of stalling on a giant IDW grid.
    // ~0.018° lat ≈ 2 km; a diagonal track keeps the point count small.
    const clean: CleanBath = {
      rows: Array.from({ length: 400 }, (_, i) => ({
        ts_ms: i * 100,
        lat: 51.7 + i * 0.000045, // ~5 m per step in lat
        lon: -1.43 + i * 0.00007, // ~5 m per step in lon
        depth_m: 1 + (i % 20) * 0.2,
        session_id: 0,
        file_id: 0,
      })),
      sessions: [],
      liftoutsRemoved: 0,
    };
    const lb = buildLayers(clean, emptyCells, { outlierTrimPct: 0 });
    // It completed and produced contour geometry along the track.
    expect(lb.bathymetry.features.length).toBeGreaterThan(0);
    expect(lb.bounds).not.toBeNull();
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

  it('produces one spot per cell (including uncategorised) carrying its stats', () => {
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
          mean_depth: 2.5,
          mean_weed: 0.1,
          fish_rate: 0.4,
          bottom_hardness: 1000,
          mean_temp_c: 18.3,
          t_start_ms: 1000,
          t_end_ms: 2000,
          category: 'gold',
        },
        {
          cx: 4,
          cy: 0,
          lat: 51.7002,
          lon: -1.43,
          n_pings: 10,
          mean_depth: 3.0,
          mean_weed: 0,
          fish_rate: 0.02,
          bottom_hardness: 900,
          category: 'none',
        },
      ],
    };
    const lb = buildLayers(emptyClean, cells, DEFAULT_COLOR_SCALE_OPTIONS, true);
    // Every cell becomes a spot — not only the categorised ones.
    expect(lb.spots?.features).toHaveLength(2);
    const gold = lb.spots?.features.find((f) => f.properties?.category === 'gold');
    expect(gold?.properties).toMatchObject({
      depth_m: 2.5,
      mean_weed: 0.1,
      fish_rate: 0.4,
      n_pings: 5,
      temp_c: 18.3,
      t_start_ms: 1000,
      t_end_ms: 2000,
    });
    // A cell without temperature omits temp_c rather than carrying undefined.
    const plain = lb.spots?.features.find((f) => f.properties?.category === 'none');
    expect(plain?.properties && 'temp_c' in plain.properties).toBe(false);
  });

  it('suppresses weed/fish/sweet-spots and omits weed/fish from spots when hasSonar is false', () => {
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
          mean_depth: 2.5,
          mean_weed: 0,
          fish_rate: 0,
          bottom_hardness: 0,
          mean_temp_c: 18.3,
          t_start_ms: 1000,
          t_end_ms: 2000,
          category: 'none',
        },
      ],
    };
    const lb = buildLayers(emptyClean, cells, DEFAULT_COLOR_SCALE_OPTIONS, false);
    expect(lb.weed.features).toHaveLength(0);
    expect(lb.fishDensity.features).toHaveLength(0);
    expect(lb.sweetSpots.features).toHaveLength(0);
    // Spots still exist (depth + temp), but weed/fish are omitted — not shown as 0.
    expect(lb.spots?.features).toHaveLength(1);
    const props = lb.spots?.features[0]?.properties as Record<string, unknown> | undefined;
    expect(props && 'depth_m' in props).toBe(true);
    expect(props && 'temp_c' in props).toBe(true);
    expect(props && 'mean_weed' in props).toBe(false);
    expect(props && 'fish_rate' in props).toBe(false);
  });
});

describe('buildLayers — bathymetry line contours', () => {
  it('produces a MultiLineString feature for each bathymetry MultiPolygon contour', () => {
    // 10x10 ping grid with a smooth depth gradient so the contour generator
    // produces a non-trivial set of polygons.
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

    // Some bathymetry contours should exist for this gradient.
    expect(lb.bathymetry.features.length).toBeGreaterThan(0);
    // Every bathymetry polygon contour produces a corresponding line contour.
    expect(lb.bathymetryLines.features).toHaveLength(lb.bathymetry.features.length);
    // The line contours are MultiLineStrings keyed off the same `level`.
    for (const f of lb.bathymetryLines.features) {
      expect(f.geometry.type).toBe('MultiLineString');
      expect(typeof f.properties?.level).toBe('number');
    }
    // Each level present in `bathymetry` is also present in `bathymetryLines`.
    const bathLevels = new Set(lb.bathymetry.features.map((f) => f.properties?.level as number));
    const lineLevels = new Set(
      lb.bathymetryLines.features.map((f) => f.properties?.level as number),
    );
    expect(lineLevels).toEqual(bathLevels);
  });

  it('returns empty bathymetryLines when there are no bathymetry polygons', () => {
    const lb = buildLayers(emptyClean, emptyCells, DEFAULT_COLOR_SCALE_OPTIONS);
    expect(lb.bathymetry.features).toHaveLength(0);
    expect(lb.bathymetryLines.features).toHaveLength(0);
  });
});

describe('buildLayers — tempStats', () => {
  it('returns null when no clean row has temp_c', () => {
    const clean: CleanBath = {
      rows: [
        { ts_ms: 100, lat: 51.7, lon: -1.43, depth_m: 1, session_id: 0, file_id: 0 },
        { ts_ms: 200, lat: 51.7, lon: -1.43, depth_m: 1.1, session_id: 0, file_id: 0 },
      ],
      sessions: [],
      liftoutsRemoved: 0,
    };
    const lb = buildLayers(clean, emptyCells, DEFAULT_COLOR_SCALE_OPTIONS);
    expect(lb.tempStats).toBeNull();
  });

  it('computes raw min/mean/max from clean.rows[*].temp_c', () => {
    const clean: CleanBath = {
      rows: [
        { ts_ms: 100, lat: 51.7, lon: -1.43, depth_m: 1, temp_c: 12, session_id: 0, file_id: 0 },
        { ts_ms: 200, lat: 51.7, lon: -1.43, depth_m: 1, temp_c: 14, session_id: 0, file_id: 0 },
        { ts_ms: 300, lat: 51.7, lon: -1.43, depth_m: 1, temp_c: 16, session_id: 0, file_id: 0 },
      ],
      sessions: [],
      liftoutsRemoved: 0,
    };
    const lb = buildLayers(clean, emptyCells, DEFAULT_COLOR_SCALE_OPTIONS);
    expect(lb.tempStats).toEqual({ min: 12, mean: 14, max: 16 });
  });

  it('skips rows where temp_c is undefined', () => {
    const clean: CleanBath = {
      rows: [
        { ts_ms: 100, lat: 51.7, lon: -1.43, depth_m: 1, temp_c: 10, session_id: 0, file_id: 0 },
        { ts_ms: 200, lat: 51.7, lon: -1.43, depth_m: 1, session_id: 0, file_id: 0 },
        { ts_ms: 300, lat: 51.7, lon: -1.43, depth_m: 1, temp_c: 20, session_id: 0, file_id: 0 },
      ],
      sessions: [],
      liftoutsRemoved: 0,
    };
    const lb = buildLayers(clean, emptyCells, DEFAULT_COLOR_SCALE_OPTIONS);
    expect(lb.tempStats).toEqual({ min: 10, mean: 15, max: 20 });
  });
});

describe('buildLayers — temperature contours', () => {
  it('returns an empty FC when no cells have mean_temp_c', () => {
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
          mean_depth: 2,
          mean_weed: 0,
          fish_rate: 0,
          bottom_hardness: 0,
          category: 'none',
        },
      ],
    };
    const lb = buildLayers(emptyClean, cells, DEFAULT_COLOR_SCALE_OPTIONS);
    expect(lb.temperature.features).toHaveLength(0);
    expect(lb.scales.temperature.levels).toHaveLength(0);
  });

  it('builds contour features when cells have mean_temp_c', () => {
    // Build a 5x5 grid of cells with a north-south temperature gradient (12°C
    // at south, 18°C at north). Should produce a few contour bands.
    const rows = [];
    for (let iy = 0; iy < 5; iy++) {
      for (let ix = 0; ix < 5; ix++) {
        rows.push({
          cx: ix * 2,
          cy: iy * 2,
          lat: 51.7 + iy * 0.0001,
          lon: -1.43 + ix * 0.0001,
          n_pings: 5,
          mean_depth: 2,
          mean_weed: 0,
          fish_rate: 0,
          bottom_hardness: 0,
          mean_temp_c: 12 + (iy / 4) * 6, // 12, 13.5, 15, 16.5, 18
          category: 'none' as const,
        });
      }
    }
    const cells: CategorisedCells = {
      cellSizeM: 2,
      origin: { lat: 51.7, lon: -1.43 },
      rows,
    };
    const lb = buildLayers(emptyClean, cells, DEFAULT_COLOR_SCALE_OPTIONS);
    expect(lb.temperature.features.length).toBeGreaterThan(0);
    expect(lb.scales.temperature.min).toBeCloseTo(12, 1);
    expect(lb.scales.temperature.max).toBeCloseTo(18, 1);
    expect(lb.scales.temperature.levels.length).toBeGreaterThan(0);
  });
});

describe('buildLayers — colour-scale levels stay within the trimmed range', () => {
  it('depth levels do not exceed scales.depth.max even when an outlier is present', () => {
    // 5 depths, the last one a clear outlier. With outlierTrimPct=1.0 (the
    // default), the trimmed range strips the 5.0 m tail so scales.depth.max
    // is < 5.0. The colour-stop levels must not extend past max — otherwise
    // the MapLibre interpolate stops disagree with the legend gradient
    // labels (a cell at the legend's stated max would render at a mid-ramp
    // colour).
    const clean: CleanBath = {
      rows: [0.5, 1.0, 1.5, 2.0, 5.0].map((d, i) => ({
        ts_ms: i * 100,
        lat: 51.7 + i * 0.0001,
        lon: -1.43,
        depth_m: d,
        session_id: 0,
        file_id: 0,
      })),
      sessions: [],
      liftoutsRemoved: 0,
    };
    const lb = buildLayers(clean, emptyCells, DEFAULT_COLOR_SCALE_OPTIONS);
    expect(lb.scales.depth.max).toBeLessThan(5.0);
    const maxLevel = lb.scales.depth.levels[lb.scales.depth.levels.length - 1];
    expect(maxLevel).toBeDefined();
    // Allow a hair (1e-6) of slop for the strict-monotonicity epsilon bumps
    // that computeContourLevels inserts on tied quantile values.
    expect(maxLevel!).toBeLessThanOrEqual(lb.scales.depth.max + 1e-6);
    // The 5.0 m outlier must NOT have leaked into the levels array — that's
    // the actual bug being fixed.
    expect(maxLevel!).toBeLessThan(5.0);
  });
});
