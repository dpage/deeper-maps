import type { FeatureCollection } from 'geojson';

/**
 * Version of the LayerBundle shape produced by the current pipeline. Bump this
 * whenever LayerBundle's shape changes (a new field, a renamed field, a removed
 * field, or a semantic change to existing fields). Cached results with a
 * non-matching version are treated as a cache miss by `setActiveScan` so
 * the worker re-analyses with the current code.
 *
 * Version history:
 *   1 — initial release.
 *   2 — adds `bounds` field for map auto-framing (commit 5565bbf).
 *   3 — adds `weedLines` field for line-style weed-over-bathymetry rendering.
 *   4 — replace weedLines with bathymetryLines for line-style bathymetry-over-weed rendering.
 *   5 — adds quantile-based `levels` to LayerScales for non-linear colour mapping.
 */
export const CURRENT_BUNDLE_VERSION = 5;

export interface LiftoutOptions {
  hardThresholdM: number;
  rollingWindow: number;
  madMultiplier: number;
  madOffsetM: number;
  sessionGapS: number;
  /**
   * Global-pass MAD multiplier. After per-session rolling-median filtering,
   * a global third pass flags any surviving row whose depth exceeds
   * `median + globalMadMultiplier * MAD + madOffsetM`. Iterates up to a
   * small fixed number of times so multi-modal lift-outs (boat parked at
   * different depths during the trip) get caught.
   *
   * Default 4.0. Lower → more aggressive (catches more sustained lift-outs
   * but may also flag real deep features in lakes with bimodal depth
   * distributions). Higher → more conservative.
   */
  globalMadMultiplier: number;
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
  /**
   * Quantile-based level values used both for contour thresholds and for
   * MapLibre colour interpolation stops. Strictly increasing. Length matches
   * the contour count for that layer (e.g. 12 for bathymetry, 8 for weed).
   * For non-contour layers (fish density), this is the colour-stop schedule
   * for the circle-color interpolate expression.
   */
  levels: number[];
}

export interface LayerScales {
  depth: ScaleRange;
  weed: ScaleRange;
  fishRate: ScaleRange;
}

export interface LayerBundle {
  bathymetry: FeatureCollection;
  weed: FeatureCollection;
  /**
   * Line-style representation of the bathymetry contours: each MultiPolygon
   * ring from `bathymetry` becomes one line in a MultiLineString. Used by
   * MapView when both bathymetry and weed are visible, so the bathymetry
   * contours render as thin lines (the cultural "elevation contour" cue)
   * over the filled weed colour. Empty when `bathymetry.features` is empty.
   */
  bathymetryLines: FeatureCollection;
  fishDensity: FeatureCollection;
  sweetSpots: FeatureCollection;
  scales: LayerScales;
  /**
   * Geographic bounding box of the scan's actual data, derived from
   * `clean.rows` (post-lift-out, GPS-interpolated). Consumers (the map view)
   * use this to fitBounds when a scan first lands. `null` when the scan
   * produced no rows — consumers should fall back to a default centre.
   */
  bounds: { sw: [number, number]; ne: [number, number] } | null;
}
