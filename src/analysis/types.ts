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
 *   6 — adds `temperature` field + `tempStats` (commit 99c17f8).
 *   7 — adds `spots` field (per-cell points for the click-to-inspect popup).
 *   8 — no bundle shape change; bumped to force a re-analyse so the worker
 *       repopulates each scan's persisted `hasSonar` flag (drives which layer
 *       controls the UI enables). Scans analysed under v7 hit the cache and
 *       would otherwise never report it.
 *   9 — adds `depthGrid` field (the interpolated lake-bed elevation model that
 *       drives the 3D view). Previously the IDW grid was discarded after
 *       contouring; now it is carried through so the 3D renderer can build a
 *       mesh without a worker round-trip.
 */
export const CURRENT_BUNDLE_VERSION = 9;

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
  /**
   * Timestamp range (epoch ms) of the pings aggregated into this cell — the
   * earliest and latest the boat was over this spot. Drives the "scanned at"
   * line in the click-to-inspect popup; a merged multi-visit cell spans days.
   * Optional for backward compatibility with cell fixtures predating this.
   */
  t_start_ms?: number;
  t_end_ms?: number;
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
  /**
   * Trimmed range + quantile contour levels for the temperature overlay.
   * Empty (`{min:0,max:1,levels:[]}`) when the scan has no cells with
   * `mean_temp_c` defined (e.g. older 4-column Quest exports).
   */
  temperature: ScaleRange;
}

/**
 * The interpolated lake-bed elevation model: a regular grid of depths produced
 * by the same IDW resample that feeds the bathymetry contours, carried through
 * so the 3D view can build a surface mesh from it. Row-major, `width × height`.
 *
 * `values` are depths in metres (positive = deeper), `NaN` for grid cells with
 * no sounding within the IDW radius (unscanned water) — the mesh builder skips
 * any triangle touching a NaN so open water leaves a hole rather than a spike.
 *
 * Cell (`gx`, `gy`) sits at local metre coordinates
 * `(origin.x + gx·cellSizeM, origin.y + gy·cellSizeM)`, which reproject to
 * lon/lat via `anchor` — the same forward projection `buildBathymetryContours`
 * used, inverted.
 */
export interface DepthGrid {
  width: number;
  height: number;
  cellSizeM: number;
  origin: { x: number; y: number };
  anchor: {
    lat0: number;
    lon0: number;
    /** Metres per degree of longitude at the scan's mean latitude. */
    lonMetresPerDeg: number;
    /** Metres per degree of latitude (constant). */
    latMetresPerDeg: number;
  };
  values: Float32Array;
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
  /**
   * One Point per aggregated cell carrying that spot's stats (depth, weed,
   * fish-rate, temperature, ping count, scan-time range). Drives the
   * click-to-inspect popup — the map finds the nearest of these to a tap.
   * Optional for backward compatibility with bundles cached before v7; the
   * version bump forces a re-analyse so it populates.
   */
  spots?: FeatureCollection;
  /**
   * Filled MultiPolygon contours over `mean_temp_c`. Empty when the scan
   * has no cells with temperature data.
   */
  temperature: FeatureCollection;
  /**
   * Interpolated lake-bed elevation model driving the 3D view. `null` when the
   * scan produced no bathymetry rows (nothing to build a surface from).
   * Optional for backward compatibility with bundles cached before v9; the
   * version bump forces a re-analyse so it populates.
   */
  depthGrid?: DepthGrid | null;
  scales: LayerScales;
  /**
   * Geographic bounding box of the scan's actual data, derived from
   * `clean.rows` (post-lift-out, GPS-interpolated). Consumers (the map view)
   * use this to fitBounds when a scan first lands. `null` when the scan
   * produced no rows — consumers should fall back to a default centre.
   */
  bounds: { sw: [number, number]; ne: [number, number] } | null;
  /**
   * Raw min/mean/max over `clean.rows[*].temp_c` (NOT trimmed). Drives the
   * panel display. `null` when no clean row has a defined `temp_c`.
   */
  tempStats: { min: number; mean: number; max: number } | null;
}
