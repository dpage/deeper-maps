import type { BathRow, SonarPing } from './types';

export interface ParseDiagnostics {
  malformedRowCount: number;
  totalRows: number;
  errors: string[];
}

const MAX_MALFORMED_FRACTION = 0.01;
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
      out.push({
        lat: nums[0]!,
        lon: nums[1]!,
        depth_m: nums[2]!,
        temp_c: nums[3]!,
        ts_ms: nums[4]!,
      });
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
