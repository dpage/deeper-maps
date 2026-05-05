import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_CELL_OPTIONS,
  DEFAULT_COLOR_SCALE_OPTIONS,
  DEFAULT_LIFTOUT_OPTIONS,
  DEFAULT_SONAR_OPTIONS,
} from '../constants';

describe('default constants', () => {
  it('liftout defaults match HANDOFF', () => {
    expect(DEFAULT_LIFTOUT_OPTIONS).toEqual({
      hardThresholdM: 5,
      rollingWindow: 31,
      madMultiplier: 6,
      madOffsetM: 0.3,
      sessionGapS: 300,
    });
  });

  it('sonar defaults match HANDOFF empirical calibration', () => {
    expect(DEFAULT_SONAR_OPTIONS).toEqual({
      binsPerM: 576.6,
      ringdownBins: 30,
      bottomHugM: 0.25,
      weedAmpFactor: 4,
      weedMinAmp: 30,
      fishAmpFactor: 10,
      fishMinAmp: 200,
      fishMinRun: 3,
    });
  });

  it('cell defaults', () => {
    expect(DEFAULT_CELL_OPTIONS).toEqual({ cellSizeM: 2, minPingsPerCell: 3 });
  });

  it('category thresholds', () => {
    expect(DEFAULT_CATEGORY_THRESHOLDS).toEqual({
      goldFishRate: 0.1,
      goldMaxWeed: 0.05,
      silverMaxWeed: 0.15,
      bronzeFishRate: 0.05,
      bronzeMaxWeed: 0.15,
      weededMinWeed: 0.15,
    });
  });

  it('colour-scale defaults', () => {
    expect(DEFAULT_COLOR_SCALE_OPTIONS).toEqual({ outlierTrimPct: 1.0 });
  });
});
