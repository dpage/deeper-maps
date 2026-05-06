import { describe, expect, it } from 'vitest';
import { DEFAULT_COLOR_SCALE_OPTIONS } from '../../constants';
import type { CategorisedCells, CleanBath } from '../../types';
import { buildLayers } from '../buildLayers';

const emptyClean: CleanBath = { rows: [], sessions: [], liftoutsRemoved: 0 };
const emptyCells: CategorisedCells = { cellSizeM: 2, origin: { lat: 0, lon: 0 }, rows: [] };

describe('buildLayers', () => {
  it('returns empty FeatureCollections when there is no data', () => {
    const lb = buildLayers(emptyClean, emptyCells, DEFAULT_COLOR_SCALE_OPTIONS);
    expect(lb.bathymetry.features).toHaveLength(0);
    expect(lb.weed.features).toHaveLength(0);
    expect(lb.fishDensity.features).toHaveLength(0);
    expect(lb.sweetSpots.features).toHaveLength(0);
    expect(lb.scales.depth.max - lb.scales.depth.min).toBeGreaterThan(0);
  });

  it('computes outlier-trimmed scales from clean bath + cells', () => {
    const clean: CleanBath = {
      rows: [
        { ts_ms: 0, lat: 0, lon: 0, depth_m: 1.0, session_id: 0, file_id: 0 },
        { ts_ms: 1, lat: 0, lon: 0, depth_m: 2.0, session_id: 0, file_id: 0 },
        { ts_ms: 2, lat: 0, lon: 0, depth_m: 3.0, session_id: 0, file_id: 0 },
      ],
      sessions: [],
      liftoutsRemoved: 0,
    };
    const cells: CategorisedCells = {
      cellSizeM: 2,
      origin: { lat: 0, lon: 0 },
      rows: [
        {
          cx: 0,
          cy: 0,
          lat: 0,
          lon: 0,
          n_pings: 5,
          mean_depth: 1.5,
          mean_weed: 0.05,
          fish_rate: 0.4,
          bottom_hardness: 1000,
          category: 'gold',
        },
      ],
    };
    const lb = buildLayers(clean, cells, { outlierTrimPct: 0 });
    expect(lb.scales.depth.min).toBe(1);
    expect(lb.scales.depth.max).toBe(3);
    expect(lb.scales.weed.min).toBeCloseTo(0.05);
    expect(lb.scales.fishRate.max).toBeCloseTo(0.4);
  });
});
