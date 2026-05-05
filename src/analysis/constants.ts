import type {
  CategoryThresholds,
  CellOptions,
  ColorScaleOptions,
  LiftoutOptions,
  SonarOptions,
} from './types';

export const DEFAULT_LIFTOUT_OPTIONS: LiftoutOptions = {
  hardThresholdM: 5,
  rollingWindow: 31,
  madMultiplier: 6,
  madOffsetM: 0.3,
  sessionGapS: 300,
};

export const DEFAULT_SONAR_OPTIONS: SonarOptions = {
  binsPerM: 576.6,
  ringdownBins: 30,
  bottomHugM: 0.25,
  weedAmpFactor: 4,
  weedMinAmp: 30,
  fishAmpFactor: 10,
  fishMinAmp: 200,
  fishMinRun: 3,
};

export const DEFAULT_CELL_OPTIONS: CellOptions = {
  cellSizeM: 2,
  minPingsPerCell: 3,
};

export const DEFAULT_CATEGORY_THRESHOLDS: CategoryThresholds = {
  goldFishRate: 0.1,
  goldMaxWeed: 0.05,
  silverMaxWeed: 0.15,
  bronzeFishRate: 0.05,
  bronzeMaxWeed: 0.15,
  weededMinWeed: 0.15,
};

export const DEFAULT_COLOR_SCALE_OPTIONS: ColorScaleOptions = {
  outlierTrimPct: 1.0,
};
