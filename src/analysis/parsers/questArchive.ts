import { zipSync } from 'fflate';
import { expandZips, type UploadFile } from './zip';
import { looksLikeDeeperMobile, parseDeeperMobileBathymetry, type ParseDiagnostics } from './quest';
import type { BathRow } from './types';

/**
 * A single uploaded file's name + bytes — a zip, a Mac-zipped export, or one
 * bare CSV. Re-exported from the zip parser so callers that only touch the
 * archive helpers (merge, export) have a single import site.
 */
export type QuestUpload = UploadFile;

/**
 * The raw CSV bytes that make up a Quest scan: the mandatory `bathymetry.csv`
 * plus an optional `sonar.csv` (a bathymetry-only scan has `sonar === null`).
 * This is the lowest-common-denominator representation shared by the import,
 * merge and export paths — everything a scan needs to be re-analysed or shared.
 */
export interface QuestCsvs {
  bathymetry: Uint8Array;
  sonar: Uint8Array | null;
}

/**
 * Serialise bathymetry rows to the internal `bathymetry.csv` format (headerless,
 * `lat,lon,depth,temp,ts` when temperature is present, `lat,lon,depth,ts`
 * otherwise). Missing temperature is forward-filled from the last known reading
 * so the output is a uniform-width CSV that the Quest parser reads back with
 * real temperatures — rather than re-introducing the mobile export's `0.0`
 * "no reading" sentinel. Used to normalise a Deeper mobile scan into the same
 * shape as a Quest export so the two can be merged and re-shared.
 */
export function serialiseBathymetry(rows: readonly BathRow[]): Uint8Array {
  const hasTemp = rows.some((r) => r.temp_c !== undefined);
  const firstTemp = rows.find((r) => r.temp_c !== undefined)?.temp_c ?? 0;
  let lastTemp = firstTemp;
  const lines: string[] = [];
  for (const r of rows) {
    if (hasTemp) {
      if (r.temp_c !== undefined) lastTemp = r.temp_c;
      lines.push(`${r.lat},${r.lon},${r.depth_m},${lastTemp},${r.ts_ms}`);
    } else {
      lines.push(`${r.lat},${r.lon},${r.depth_m},${r.ts_ms}`);
    }
  }
  return new TextEncoder().encode(lines.join('\n') + '\n');
}

/**
 * Pull the `bathymetry.csv` (+ optional `sonar.csv`) bytes out of an upload — a
 * zip, a Mac-zipped export, or a bare CSV — in the internal Quest format. Uses
 * the same `expandZips` decompression + resource-fork filtering as
 * {@link parseQuestUpload}, so `__MACOSX/` junk and AppleDouble `._` sidecars
 * are discarded before they can shadow the real files.
 *
 * A Quest scan's CSV bytes pass through untouched, so an export → import
 * round-trip reproduces it exactly. A Deeper mobile `scan_data.csv` (headered,
 * sparse GPS, no sonar) is normalised via {@link serialiseBathymetry} into the
 * same headerless bathymetry.csv shape, which is what lets a mobile scan be
 * merged with — or exported alongside — Quest scans.
 */
export function extractQuestCsvs(uploads: UploadFile[]): QuestCsvs {
  const expanded = expandZips(uploads);

  const mobile = expanded.find((f) => looksLikeDeeperMobile(f.bytes));
  if (mobile) {
    const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const rows = parseDeeperMobileBathymetry(mobile.bytes, diag);
    return { bathymetry: serialiseBathymetry(rows), sonar: null };
  }

  const bath = expanded.find((f) => f.fileName.toLowerCase() === 'bathymetry.csv');
  const sonar = expanded.find((f) => f.fileName.toLowerCase() === 'sonar.csv');
  if (!bath) {
    throw new Error('No bathymetry.csv found in scan');
  }
  return { bathymetry: bath.bytes, sonar: sonar ? sonar.bytes : null };
}

const NEWLINE = 0x0a;

/**
 * Concatenate CSV byte buffers end to end, guaranteeing exactly one newline
 * between each part so the last row of one file never runs into the first row
 * of the next (Deeper exports frequently omit the trailing newline). Empty
 * parts are dropped. Row ORDERING across the join is irrelevant to the
 * pipeline: {@link cleanBathymetry} sorts bathymetry by timestamp and partitions
 * into sessions by time gap, and {@link analysePings} joins sonar to bathymetry
 * by timestamp — so two scans captured on different days fall into separate
 * sessions automatically, regardless of the order their rows appear here.
 */
export function concatCsv(parts: Uint8Array[]): Uint8Array {
  const nonEmpty = parts.filter((p) => p.length > 0);
  let total = 0;
  for (const p of nonEmpty) {
    total += p.length;
    if (p[p.length - 1] !== NEWLINE) total += 1;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of nonEmpty) {
    out.set(p, offset);
    offset += p.length;
    if (p[p.length - 1] !== NEWLINE) {
      out[offset] = NEWLINE;
      offset += 1;
    }
  }
  return out;
}

/**
 * Build a zip in the exact shape the importer accepts: `bathymetry.csv` (and
 * `sonar.csv` when present) at the archive root. Re-importing the result is a
 * no-op round-trip, which is what makes exported scans shareable — the person
 * you send it to drops it into their own library like any other Quest export.
 */
export function buildQuestZip(csvs: QuestCsvs): Uint8Array {
  const entries: Record<string, Uint8Array> = { 'bathymetry.csv': csvs.bathymetry };
  if (csvs.sonar) entries['sonar.csv'] = csvs.sonar;
  // A fixed mtime keeps the output byte-for-byte deterministic for identical
  // input (zip stores per-entry timestamps, which would otherwise default to
  // "now"). The epoch itself is out of zip's 1980-2099 range, so we pin the
  // earliest representable date instead.
  return zipSync(entries, { mtime: '1980-01-01T00:00:00Z' });
}

/**
 * Combine several Quest scans into one by concatenating their CSVs. `sonar` is
 * present in the result iff at least one input contributed sonar data; a merge
 * of purely bathymetry-only scans stays bathymetry-only.
 */
export function mergeQuestArchives(archives: QuestCsvs[]): QuestCsvs {
  if (archives.length === 0) {
    throw new Error('mergeQuestArchives: no archives to merge');
  }
  const bathymetry = concatCsv(archives.map((a) => a.bathymetry));
  const sonarParts = archives.map((a) => a.sonar).filter((s): s is Uint8Array => s !== null);
  const sonar = sonarParts.length > 0 ? concatCsv(sonarParts) : null;
  return { bathymetry, sonar };
}
