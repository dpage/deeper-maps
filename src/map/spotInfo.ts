import type { Feature, Point } from 'geojson';

/**
 * Properties carried by each cell "spot" point (built in `buildLayers.buildSpots`).
 * All numeric; `category`/temperature/timestamps may be absent on older data.
 */
export interface SpotProperties {
  depth_m: number;
  mean_weed: number;
  fish_rate: number;
  n_pings: number;
  bottom_hardness?: number;
  temp_c?: number;
  category?: string;
  t_start_ms?: number;
  t_end_ms?: number;
}

const METRES_PER_DEG_LAT = 111_000;

/**
 * Approximate ground distance in metres between a spot and a lng/lat, using the
 * same equirectangular approximation as {@link findNearestSpot}. Used to decide
 * whether a tap landed on the scanned area (near a measured cell) or outside it.
 * Returns `Infinity` for a feature with missing coordinates.
 */
export function spotDistanceMeters(feature: Feature<Point>, lng: number, lat: number): number {
  const lon0 = feature.geometry.coordinates[0];
  const lat0 = feature.geometry.coordinates[1];
  if (lon0 === undefined || lat0 === undefined) return Infinity;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const dx = (lon0 - lng) * cosLat * METRES_PER_DEG_LAT;
  const dy = (lat0 - lat) * METRES_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

/** Formats an epoch-ms timestamp to a human string. Injectable for testing. */
export type TimestampFormatter = (ms: number) => string;

const defaultFormatTimestamp: TimestampFormatter = (ms) => new Date(ms).toLocaleString();

// Below this span the start/end of a cell's pings are effectively one moment.
const RANGE_THRESHOLD_MS = 60_000;

/**
 * Find the geographically nearest spot to a lng/lat. Uses an equirectangular
 * approximation (good at the scale of a single lake) rather than full great-
 * circle distance — cheap enough to run over every cell on each click. Returns
 * `null` for an empty list.
 */
export function findNearestSpot(
  features: readonly Feature<Point>[],
  lng: number,
  lat: number,
): Feature<Point> | null {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  let best: Feature<Point> | null = null;
  let bestDist = Infinity;
  for (const f of features) {
    const lon0 = f.geometry.coordinates[0];
    const lat0 = f.geometry.coordinates[1];
    if (lon0 === undefined || lat0 === undefined) continue;
    const dx = (lon0 - lng) * cosLat;
    const dy = lat0 - lat;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = f;
    }
  }
  return best;
}

/**
 * Render the "scanned at" line: a single time, or a `start – end` range when
 * the cell's pings span more than a minute (e.g. a spot surveyed on two visits
 * of a merged scan). Returns `null` when no timestamp is available.
 */
export function formatScanTime(
  tStart: number | undefined,
  tEnd: number | undefined,
  fmt: TimestampFormatter = defaultFormatTimestamp,
): string | null {
  if (tStart === undefined) return null;
  const start = fmt(tStart);
  if (tEnd === undefined || tEnd - tStart < RANGE_THRESHOLD_MS) return start;
  const end = fmt(tEnd);
  return start === end ? start : `${start} – ${end}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CATEGORY_LABELS: Record<string, string> = {
  gold: 'Gold',
  silver: 'Silver',
  bronze: 'Bronze',
  weeded: 'Weeded',
};

/**
 * Build the popup body (an HTML table) describing a tapped spot: when it was
 * scanned, depth, water temperature, weed height, fish rate, sample count and
 * — when the cell is a categorised sweet spot — its tier. All values are
 * app-generated numbers/dates, but the assembled strings are HTML-escaped
 * defensively before interpolation.
 */
export function formatSpotPopupHtml(
  props: SpotProperties,
  fmt: TimestampFormatter = defaultFormatTimestamp,
): string {
  const rows: [string, string][] = [];
  const scanned = formatScanTime(props.t_start_ms, props.t_end_ms, fmt);
  if (scanned) rows.push(['Scanned', scanned]);
  rows.push(['Depth', `${props.depth_m.toFixed(1)} m`]);
  if (props.temp_c !== undefined) rows.push(['Water temp', `${props.temp_c.toFixed(1)} °C`]);
  rows.push(['Weed', `${props.mean_weed.toFixed(2)} m`]);
  rows.push(['Fish rate', `${Math.round(props.fish_rate * 100)}%`]);
  rows.push(['Samples', String(props.n_pings)]);
  const label = props.category ? CATEGORY_LABELS[props.category] : undefined;
  if (label) rows.push(['Sweet spot', label]);

  const body = rows
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join('');
  return `<table class="spot-popup">${body}</table>`;
}
