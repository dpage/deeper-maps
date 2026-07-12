import type { BathRow, SonarPing } from './types';

export interface ParseDiagnostics {
  malformedRowCount: number;
  totalRows: number;
  errors: string[];
}

const MAX_MALFORMED_FRACTION = 0.01;

/**
 * Deeper's temperature channel is noisy at both ends. It reads `0.0` as a "no
 * reading" sentinel (e.g. on GPS-only rows before the probe samples), and can
 * emit wild highs when the sensor is lifted out of the water and bakes in the
 * sun. Keep only physically plausible freshwater readings: strictly above 0 °C
 * (so the sentinel is dropped, but genuine near-freezing water survives) and no
 * warmer than a ceiling no fishing venue reaches — a hotter reading is the
 * sensor in air, not water. Filtering here keeps both the temperature scale and
 * the min/mean/max readout honest.
 */
const MAX_PLAUSIBLE_WATER_TEMP_C = 40;

export function plausibleWaterTemp(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 && value <= MAX_PLAUSIBLE_WATER_TEMP_C
    ? value
    : undefined;
}
/**
 * The malformed-row threshold is only meaningful at scale — a real scan has
 * thousands of rows. Below this floor we skip the percentage check so a tiny
 * fixture or unusually short scan isn't rejected for a single bad row.
 */
const MALFORMED_THRESHOLD_MIN_ROWS = 100;

/**
 * A stub file is a near-empty Deeper export — typically a single dummy row of
 * zeros emitted when a scan was started but no real pings were captured.
 * We treat any file with fewer than two non-empty data rows as a stub: a real
 * scan needs at least one start row plus one subsequent row to be analysable.
 */
const STUB_MIN_ROWS = 2;

const NEWLINE = 0x0a;
const CARRIAGE_RETURN = 0x0d;

/**
 * Iterate a CSV file's rows WITHOUT materialising the whole file as one giant
 * UTF-16 string (which `strFromU8` would do) or a full 2-D array of every cell
 * (which `Papa.parse` in buffering mode would do). For a large scan — a 70 MB
 * zip can decompress to hundreds of MB of sonar text — those two allocations,
 * plus PapaParse's per-cell string objects, are what exhaust memory on a
 * tablet/phone and get the Web Worker silently killed by the OS.
 *
 * Deeper exports are plain numeric CSV: no quoted fields, no embedded newlines,
 * no escapes. So splitting on `\n` (tolerating a trailing `\r`) and then on `,`
 * reproduces PapaParse's behaviour for this input exactly, while keeping only a
 * single short line-string alive at a time. `skipEmptyLines: true` semantics
 * are preserved: a truly empty line is skipped, but a delimiter-only line
 * (e.g. `,,,`) is retained and handed to the caller as an all-empty row.
 */
function forEachCsvRow(bytes: Uint8Array, onRow: (cols: string[]) => void): void {
  const decoder = new TextDecoder();
  const n = bytes.length;
  // Skip a leading UTF-8 BOM (EF BB BF) if present so the first cell doesn't
  // carry a stray zero-width char that would make Number() return NaN.
  let start = n >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  for (let i = start; i <= n; i++) {
    if (i !== n && bytes[i] !== NEWLINE) continue;
    let end = i;
    if (end > start && bytes[end - 1] === CARRIAGE_RETURN) end--; // strip trailing \r
    if (end > start) {
      onRow(decoder.decode(bytes.subarray(start, end)).split(','));
    }
    start = i + 1;
  }
}

export function parseQuestBathymetry(bytes: Uint8Array, diagnostics: ParseDiagnostics): BathRow[] {
  const out: BathRow[] = [];
  let firstColCount = -1;
  let total = 0;
  let malformed = 0;
  let hasGps = false;

  forEachCsvRow(bytes, (cols) => {
    if (firstColCount === -1) firstColCount = cols.length;
    total++;
    // Once we know the header shape is unusable, stop doing per-row work — the
    // whole parse is going to be rejected below anyway.
    if (firstColCount !== 4 && firstColCount !== 5) return;
    if (cols.length !== firstColCount) {
      malformed++;
      return;
    }
    // Reject rows with empty/whitespace cells: Number('') and Number('   ') both
    // return 0, which would silently masquerade as a real "GPS not fixed" row
    // (lat=0, lon=0) or a zero timestamp/depth.
    if (cols.some((c) => c.trim() === '')) {
      malformed++;
      return;
    }
    const nums = cols.map(Number);
    if (nums.some((v) => Number.isNaN(v))) {
      malformed++;
      return;
    }
    if (firstColCount === 5) {
      const row: BathRow = { lat: nums[0]!, lon: nums[1]!, depth_m: nums[2]!, ts_ms: nums[4]! };
      // 0.0 is the "no reading" sentinel and out-of-water spikes are noise;
      // keep only plausible freshwater readings (see plausibleWaterTemp).
      const temp = plausibleWaterTemp(nums[3]!);
      if (temp !== undefined) row.temp_c = temp;
      out.push(row);
    } else {
      out.push({ lat: nums[0]!, lon: nums[1]!, depth_m: nums[2]!, ts_ms: nums[3]! });
    }
    if (nums[0] !== 0 || nums[1] !== 0) hasGps = true;
  });

  if (total === 0) {
    throw new Error('parseQuestBathymetry: no rows found');
  }
  if (firstColCount !== 4 && firstColCount !== 5) {
    throw new Error(
      `parseQuestBathymetry: expected 4 or 5 columns in first row, got ${firstColCount}. ` +
        `Is this a Quest export?`,
    );
  }
  if (total < STUB_MIN_ROWS) {
    throw new Error(`Stub file detected (${total} row). Skip and don't import.`);
  }

  diagnostics.totalRows = total;
  diagnostics.malformedRowCount = malformed;

  if (total >= MALFORMED_THRESHOLD_MIN_ROWS && malformed / total > MAX_MALFORMED_FRACTION) {
    throw new Error(
      `parseQuestBathymetry: malformed rows exceed ${(MAX_MALFORMED_FRACTION * 100).toFixed(0)}% ` +
        `(${malformed} of ${total}).`,
    );
  }

  // Deeper Start CSV exports omit GPS — every row's lat/lon is 0. Without any
  // anchor coordinates the scan cannot be plotted, so reject up front with a
  // message that explains the cause rather than silently producing an empty
  // map. (A Quest scan that lost GPS for the entire session lands here too.)
  if (out.length > 0 && !hasGps) {
    throw new Error(
      `No GPS coordinates found in bathymetry.csv. Deeper Start exports do not ` +
        `include GPS data, so the scan cannot be plotted on a map. Use the Deeper ` +
        `app's map view, or upload a Quest/PRO scan instead.`,
    );
  }

  return out;
}

/**
 * Sniff whether a CSV is a Deeper mobile (iOS/Android app) "scan_data" export
 * rather than a Quest desktop export. The mobile file leads with a header row
 * — `latitude,longtitude,depth,temperature,time` (note Deeper's "longtitude"
 * typo) — which the headerless Quest CSVs never have. We match on the presence
 * of the `latitude`, `depth` and `time` column names so a future header tweak
 * (or the typo being fixed) still routes correctly.
 */
export function looksLikeDeeperMobile(bytes: Uint8Array): boolean {
  // Decode only the first line; the header is all we need.
  let end = bytes.length;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === NEWLINE) {
      end = i;
      break;
    }
  }
  const start = end >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const header = new TextDecoder().decode(bytes.subarray(start, end)).toLowerCase();
  const cols = header.split(',').map((c) => c.trim());
  return cols.includes('latitude') && cols.includes('depth') && cols.includes('time');
}

/**
 * Parse a Deeper mobile "scan_data" CSV into bathymetry rows. Columns are
 * `latitude, longtitude, depth, temperature, time` (same order as a Quest
 * 5-column export), but with two mobile-specific quirks handled here:
 *
 *  - A leading header row (skipped).
 *  - GPS is logged only ~once per second, so most rows have BLANK lat/lon while
 *    depth/temperature stream at a higher rate. Blank coordinates become the
 *    (0, 0) "no fix" sentinel so `cleanBathymetry` interpolates them between the
 *    surrounding fixes, exactly as it does for a Quest scan that dropped GPS.
 *  - Temperature reads `0.0` on the GPS rows (the device doesn't sample it
 *    then); that's a "no reading" sentinel, so a 0 temperature is treated as
 *    absent rather than a real 0 °C that would drag the temperature scale down.
 *
 * There is no sonar in this export, so the scan runs in bathymetry-only mode
 * (depth + temperature; no weed/fish/sweet-spots).
 */
export function parseDeeperMobileBathymetry(
  bytes: Uint8Array,
  diagnostics: ParseDiagnostics,
): BathRow[] {
  const out: BathRow[] = [];
  let total = 0;
  let malformed = 0;
  let hasGps = false;

  forEachCsvRow(bytes, (cols) => {
    // Skip the header row wherever it appears (defensively, not just row 0).
    if (cols[0]?.trim().toLowerCase() === 'latitude') return;
    total++;
    if (cols.length !== 5) {
      malformed++;
      return;
    }
    // Depth and timestamp are mandatory and must be finite.
    if (cols[2]!.trim() === '' || cols[4]!.trim() === '') {
      malformed++;
      return;
    }
    const depth = Number(cols[2]);
    const ts = Number(cols[4]);
    if (!Number.isFinite(depth) || !Number.isFinite(ts)) {
      malformed++;
      return;
    }
    // Blank GPS → (0, 0) no-fix sentinel (interpolated downstream).
    const latStr = cols[0]!.trim();
    const lonStr = cols[1]!.trim();
    const lat = latStr === '' ? 0 : Number(latStr);
    const lon = lonStr === '' ? 0 : Number(lonStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      malformed++;
      return;
    }
    const row: BathRow = { lat, lon, depth_m: depth, ts_ms: ts };
    // Keep only plausible freshwater readings — drops the 0.0 "no reading"
    // sentinel and out-of-water spikes alike (see plausibleWaterTemp).
    const tempStr = cols[3]!.trim();
    if (tempStr !== '') {
      const temp = plausibleWaterTemp(Number(tempStr));
      if (temp !== undefined) row.temp_c = temp;
    }
    out.push(row);
    if (lat !== 0 || lon !== 0) hasGps = true;
  });

  if (total === 0) {
    throw new Error('parseDeeperMobileBathymetry: no rows found');
  }
  if (total < STUB_MIN_ROWS) {
    throw new Error(`Stub file detected (${total} row). Skip and don't import.`);
  }

  diagnostics.totalRows = total;
  diagnostics.malformedRowCount = malformed;

  if (total >= MALFORMED_THRESHOLD_MIN_ROWS && malformed / total > MAX_MALFORMED_FRACTION) {
    throw new Error(
      `parseDeeperMobileBathymetry: malformed rows exceed ${(MAX_MALFORMED_FRACTION * 100).toFixed(0)}% ` +
        `(${malformed} of ${total}).`,
    );
  }

  if (out.length > 0 && !hasGps) {
    throw new Error(
      `No GPS coordinates found in this export. Without any GPS fixes the scan ` +
        `cannot be plotted on a map.`,
    );
  }

  return out;
}

export function parseQuestSonar(bytes: Uint8Array, diagnostics: ParseDiagnostics): SonarPing[] {
  const out: SonarPing[] = [];
  let total = 0;
  let malformed = 0;

  forEachCsvRow(bytes, (cols) => {
    total++;
    if (cols.length < 2) {
      malformed++;
      return;
    }
    // Same rationale as in parseQuestBathymetry: an empty/whitespace cell would
    // coerce to 0 and could create a zero-timestamp ping (joins to nothing) or a
    // false zero amplitude that passes Number.isInteger.
    if (cols.some((c) => c.trim() === '')) {
      malformed++;
      return;
    }
    const ts = Number(cols[0]);
    if (!Number.isFinite(ts)) {
      malformed++;
      return;
    }
    const amps = new Int32Array(cols.length - 1);
    let badAmp = false;
    for (let j = 1; j < cols.length; j++) {
      const v = Number(cols[j]);
      if (!Number.isInteger(v)) {
        badAmp = true;
        break;
      }
      amps[j - 1] = v;
    }
    if (badAmp) {
      malformed++;
      return;
    }
    out.push({ ts_ms: ts, amps });
  });

  if (total === 0) {
    throw new Error('parseQuestSonar: no rows found');
  }
  if (total < STUB_MIN_ROWS) {
    throw new Error(`Stub file detected (${total} row). Skip and don't import.`);
  }

  diagnostics.totalRows = total;
  diagnostics.malformedRowCount = malformed;

  if (total >= MALFORMED_THRESHOLD_MIN_ROWS && malformed / total > MAX_MALFORMED_FRACTION) {
    throw new Error(
      `parseQuestSonar: malformed rows exceed ${(MAX_MALFORMED_FRACTION * 100).toFixed(0)}% ` +
        `(${malformed} of ${total}).`,
    );
  }

  return out;
}
