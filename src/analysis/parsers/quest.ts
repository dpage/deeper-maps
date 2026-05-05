import Papa from 'papaparse';
import type { BathRow } from './types';

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

  return out;
}
