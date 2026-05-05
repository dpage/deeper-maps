import type { FeatureCollection } from 'geojson';

export interface LiftoutOptions {
  hardThresholdM: number;
  rollingWindow: number;
  madMultiplier: number;
  madOffsetM: number;
  sessionGapS: number;
}

export interface SonarOptions {
  binsPerM: number;
  ringdownBins: number;
  bottomHugM: number;
  weedAmpFactor: number;
  weedMinAmp: number;
  fishAmpFactor: number;
  fishMinAmp: number;
  fishMinRun: number;
}

export interface CellOptions {
  cellSizeM: number;
  minPingsPerCell: number;
}

export interface CategoryThresholds {
  goldFishRate: number;
  goldMaxWeed: number;
  silverMaxWeed: number;
  bronzeFishRate: number;
  bronzeMaxWeed: number;
  weededMinWeed: number;
}

export interface ColorScaleOptions {
  outlierTrimPct: number;
}

export interface PipelineOptions {
  liftout: LiftoutOptions;
  sonar: SonarOptions;
  cell: CellOptions;
  category: CategoryThresholds;
  colorScale: ColorScaleOptions;
}

export interface CleanBathRow {
  ts_ms: number;
  lat: number;
  lon: number;
  depth_m: number;
  temp_c?: number;
  session_id: number;
  file_id: number;
}

export interface SessionMeta {
  id: number;
  t_start: number;
  t_end: number;
  n_pings: number;
  was_lifted_out_pct: number;
}

export interface CleanBath {
  rows: CleanBathRow[];
  sessions: SessionMeta[];
  liftoutsRemoved: number;
}

export interface PerPingRow {
  ts_ms: number;
  lat: number;
  lon: number;
  depth_m: number;
  temp_c?: number;
  weed_height_m: number;
  fish_count: number;
  fish_max_amp: number;
  hard_bottom_peak: number;
  noise_floor: number;
  session_id: number;
}

export interface PerPing {
  rows: PerPingRow[];
}

export interface CellRow {
  cx: number;
  cy: number;
  lat: number;
  lon: number;
  n_pings: number;
  mean_depth: number;
  mean_weed: number;
  fish_rate: number;
  bottom_hardness: number;
  mean_temp_c?: number;
}

export interface Cells {
  cellSizeM: number;
  origin: { lat: number; lon: number };
  rows: CellRow[];
}

export type ScanCategory = 'gold' | 'silver' | 'bronze' | 'weeded' | 'none';

export interface CategorisedCellRow extends CellRow {
  category: ScanCategory;
}

export interface CategorisedCells {
  cellSizeM: number;
  origin: { lat: number; lon: number };
  rows: CategorisedCellRow[];
}

export interface ScaleRange {
  min: number;
  max: number;
}

export interface LayerScales {
  depth: ScaleRange;
  weed: ScaleRange;
  fishRate: ScaleRange;
}

export interface LayerBundle {
  bathymetry: FeatureCollection;
  weed: FeatureCollection;
  fishDensity: FeatureCollection;
  sweetSpots: FeatureCollection;
  scales: LayerScales;
}
