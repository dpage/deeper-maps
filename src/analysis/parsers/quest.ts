import Papa from 'papaparse';
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
function isStubFile(text: string): boolean {
  const lineCount = text.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
  return lineCount < 2;
}

export function parseQuestBathymetry(text: string, diagnostics: ParseDiagnostics): BathRow[] {
  const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  for (const e of parsed.errors) {
    diagnostics.errors.push(`row ${e.row ?? '?'}: ${e.code} — ${e.message}`);
  }
  const rawRows = parsed.data;
  if (rawRows.length === 0) {
    throw new Error('parseQuestBathymetry: no rows found');
  }

  const firstColCount = rawRows[0]!.length;
  if (firstColCount !== 4 && firstColCount !== 5) {
    throw new Error(
      `parseQuestBathymetry: expected 4 or 5 columns in first row, got ${firstColCount}. ` +
        `Is this a Quest export?`,
    );
  }

  if (isStubFile(text)) {
    throw new Error(`Stub file detected (length=${text.length} bytes). Skip and don't import.`);
  }

  const out: BathRow[] = [];
  diagnostics.totalRows = rawRows.length;
  for (let i = 0; i < rawRows.length; i++) {
    const cols = rawRows[i]!;
    if (cols.length !== firstColCount) {
      diagnostics.malformedRowCount++;
      continue;
    }
    // Reject rows with empty/whitespace cells: Number('') and Number('   ') both
    // return 0, which would silently masquerade as a real "GPS not fixed" row
    // (lat=0, lon=0) or a zero timestamp/depth.
    if (cols.some((c) => c.trim() === '')) {
      diagnostics.malformedRowCount++;
      continue;
    }
    const nums = cols.map(Number);
    if (nums.some((n) => Number.isNaN(n))) {
      diagnostics.malformedRowCount++;
      continue;
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
      out.push({
        lat: nums[0]!,
        lon: nums[1]!,
        depth_m: nums[2]!,
        ts_ms: nums[3]!,
      });
    }
  }

  if (
    diagnostics.totalRows >= MALFORMED_THRESHOLD_MIN_ROWS &&
    diagnostics.malformedRowCount / diagnostics.totalRows > MAX_MALFORMED_FRACTION
  ) {
    throw new Error(
      `parseQuestBathymetry: malformed rows exceed ${(MAX_MALFORMED_FRACTION * 100).toFixed(0)}% ` +
        `(${diagnostics.malformedRowCount} of ${diagnostics.totalRows}).`,
    );
  }

  // Deeper Start CSV exports omit GPS — every row's lat/lon is 0. Without any
  // anchor coordinates the scan cannot be plotted, so reject up front with a
  // message that explains the cause rather than silently producing an empty
  // map. (A Quest scan that lost GPS for the entire session lands here too.)
  if (out.length > 0 && !out.some((r) => r.lat !== 0 || r.lon !== 0)) {
    throw new Error(
      `No GPS coordinates found in bathymetry.csv. Deeper Start exports do not ` +
        `include GPS data, so the scan cannot be plotted on a map. Use the Deeper ` +
        `app's map view, or upload a Quest/PRO scan instead.`,
    );
  }

  return out;
}

export function parseQuestSonar(text: string, diagnostics: ParseDiagnostics): SonarPing[] {
  if (isStubFile(text)) {
    throw new Error(`Stub file detected (length=${text.length} bytes). Skip and don't import.`);
  }

  const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  for (const e of parsed.errors) {
    diagnostics.errors.push(`row ${e.row ?? '?'}: ${e.code} — ${e.message}`);
  }
  const rawRows = parsed.data;
  if (rawRows.length === 0) throw new Error('parseQuestSonar: no rows found');

  diagnostics.totalRows = rawRows.length;
  const out: SonarPing[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const cols = rawRows[i]!;
    if (cols.length < 2) {
      diagnostics.malformedRowCount++;
      continue;
    }
    // Same rationale as in parseQuestBathymetry: an empty/whitespace cell would
    // coerce to 0 and could create a zero-timestamp ping (joins to nothing) or a
    // false zero amplitude that passes Number.isInteger.
    if (cols.some((c) => c.trim() === '')) {
      diagnostics.malformedRowCount++;
      continue;
    }
    const ts = Number(cols[0]);
    if (!Number.isFinite(ts)) {
      diagnostics.malformedRowCount++;
      continue;
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
      diagnostics.malformedRowCount++;
      continue;
    }
    out.push({ ts_ms: ts, amps });
  }

  if (
    diagnostics.totalRows >= MALFORMED_THRESHOLD_MIN_ROWS &&
    diagnostics.malformedRowCount / diagnostics.totalRows > MAX_MALFORMED_FRACTION
  ) {
    throw new Error(
      `parseQuestSonar: malformed rows exceed ${(MAX_MALFORMED_FRACTION * 100).toFixed(0)}% ` +
        `(${diagnostics.malformedRowCount} of ${diagnostics.totalRows}).`,
    );
  }
  return out;
}
