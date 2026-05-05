import type {
  CategorisedCells,
  Cells,
  CleanBath,
  LayerBundle,
  PerPing,
  PipelineOptions,
  ScanCategory,
} from '../types';
import { describe, expect, it } from 'vitest';

describe('analysis types', () => {
  it('ScanCategory is the documented union', () => {
    const all: ScanCategory[] = ['gold', 'silver', 'bronze', 'weeded', 'none'];
    expect(all).toHaveLength(5);
  });

  it('CleanBath has rows, sessions, liftoutsRemoved', () => {
    const cb: CleanBath = {
      rows: [],
      sessions: [{ id: 0, t_start: 0, t_end: 1, n_pings: 0, was_lifted_out_pct: 0 }],
      liftoutsRemoved: 0,
    };
    expect(cb.sessions[0]?.id).toBe(0);
  });

  it('PerPing.rows entries carry sonar analysis fields', () => {
    const pp: PerPing = {
      rows: [
        {
          ts_ms: 0,
          lat: 0,
          lon: 0,
          depth_m: 1,
          weed_height_m: 0.05,
          fish_count: 0,
          fish_max_amp: 0,
          hard_bottom_peak: 100,
          noise_floor: 5,
          session_id: 0,
        },
      ],
    };
    expect(pp.rows[0]?.weed_height_m).toBe(0.05);
  });

  it('Cells has projection origin', () => {
    const c: Cells = {
      cellSizeM: 2,
      origin: { lat: 51, lon: -1 },
      rows: [],
    };
    expect(c.origin.lat).toBe(51);
  });

  it('CategorisedCells extends Cells with category field', () => {
    const cc: CategorisedCells = {
      cellSizeM: 2,
      origin: { lat: 51, lon: -1 },
      rows: [
        {
          cx: 0,
          cy: 0,
          lat: 51,
          lon: -1,
          n_pings: 5,
          mean_depth: 1,
          mean_weed: 0,
          fish_rate: 0.5,
          bottom_hardness: 100,
          category: 'gold',
        },
      ],
    };
    expect(cc.rows[0]?.category).toBe('gold');
  });

  it('LayerBundle.scales has depth/weed/fishRate', () => {
    const lb: LayerBundle = {
      bathymetry: { type: 'FeatureCollection', features: [] },
      weed: { type: 'FeatureCollection', features: [] },
      fishDensity: { type: 'FeatureCollection', features: [] },
      sweetSpots: { type: 'FeatureCollection', features: [] },
      scales: {
        depth: { min: 0, max: 1 },
        weed: { min: 0, max: 1 },
        fishRate: { min: 0, max: 1 },
      },
    };
    expect(lb.scales.depth.max).toBe(1);
  });

  it('PipelineOptions composes all option groups', () => {
    const opts: PipelineOptions = {
      liftout: {
        hardThresholdM: 5,
        rollingWindow: 31,
        madMultiplier: 6,
        madOffsetM: 0.3,
        sessionGapS: 300,
      },
      sonar: {
        binsPerM: 576.6,
        ringdownBins: 30,
        bottomHugM: 0.25,
        weedAmpFactor: 4,
        weedMinAmp: 30,
        fishAmpFactor: 10,
        fishMinAmp: 200,
        fishMinRun: 3,
      },
      cell: { cellSizeM: 2, minPingsPerCell: 3 },
      category: {
        goldFishRate: 0.1,
        goldMaxWeed: 0.05,
        silverMaxWeed: 0.15,
        bronzeFishRate: 0.05,
        bronzeMaxWeed: 0.15,
        weededMinWeed: 0.15,
      },
      colorScale: { outlierTrimPct: 1.0 },
    };
    expect(opts.sonar.binsPerM).toBeCloseTo(576.6);
  });
});
