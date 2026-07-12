import { unzipSync } from 'fflate';
import type { RawScan, SourceFileMeta } from './types';
import {
  looksLikeDeeperMobile,
  parseDeeperMobileBathymetry,
  parseQuestBathymetry,
  parseQuestSonar,
  type ParseDiagnostics,
} from './quest';

export interface UploadFile {
  fileName: string;
  bytes: Uint8Array;
}

export interface UploadResult {
  scan: RawScan;
  warnings: string[];
}

const RECOGNISED = new Set(['bathymetry.csv', 'sonar.csv']);

/**
 * Whether a zip entry is a file we actually parse. Anything else — READMEs,
 * duplicate depth maps, images, and especially macOS resource-fork junk
 * (`__MACOSX/` subtrees and AppleDouble `._` sidecars) — is rejected. This
 * runs as fflate's decompression `filter`, so unrecognised entries are never
 * inflated: on a real Deeper export only bathymetry.csv + sonar.csv are
 * decompressed, which keeps peak memory bounded to the two files we need
 * rather than the entire archive. It also removes the Mac-zip shadowing risk,
 * because the __MACOSX copy is discarded before it can compete with the real
 * CSV at the archive root.
 */
function isRecognisedEntry(name: string): boolean {
  const segments = name.split('/');
  if (segments.includes('__MACOSX')) return false;
  const base = segments[segments.length - 1] ?? name;
  if (base === '') return false; // directory entry
  if (base.startsWith('._')) return false;
  return RECOGNISED.has(base.toLowerCase());
}

export function expandZips(uploads: UploadFile[]): UploadFile[] {
  const out: UploadFile[] = [];
  for (const u of uploads) {
    if (u.fileName.toLowerCase().endsWith('.zip')) {
      const entries = unzipSync(u.bytes, { filter: (file) => isRecognisedEntry(file.name) });
      for (const [name, bytes] of Object.entries(entries)) {
        const segments = name.split('/');
        const base = segments[segments.length - 1] ?? name;
        out.push({ fileName: base, bytes });
      }
    } else {
      out.push(u);
    }
  }
  return out;
}

function parseDeeperMobileUpload(file: UploadFile): UploadResult {
  const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
  const bathymetry = parseDeeperMobileBathymetry(file.bytes, diag);
  const warnings: string[] = [];
  if (diag.malformedRowCount > 0) {
    warnings.push(
      `${file.fileName}: skipped ${diag.malformedRowCount} of ${diag.totalRows} malformed rows`,
    );
  }
  warnings.push(
    'This Deeper mobile export has no sonar data — showing depth and temperature only ' +
      '(weed, fish density and sweet spots need a Quest zip).',
  );
  return {
    scan: {
      device: 'quest',
      bathymetry,
      sonar: [],
      source: [{ fileName: file.fileName, byteSize: file.bytes.length }],
    },
    warnings,
  };
}

/**
 * Promise return is part of the public contract: Plan 2 dispatches this to a
 * Web Worker, at which point the body becomes genuinely async. Keeping the
 * signature stable now avoids a breaking API change later.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function parseQuestUpload(uploads: UploadFile[]): Promise<UploadResult> {
  const expanded = expandZips(uploads);

  // Deeper mobile "scan_data" export: a single headered CSV with depth +
  // temperature + sparse GPS, no sonar. Detected by content (its header) rather
  // than filename, since the app names it scan_data_<timestamp>.csv.
  const mobile = expanded.find((f) => looksLikeDeeperMobile(f.bytes));
  if (mobile) {
    return parseDeeperMobileUpload(mobile);
  }

  const recognised = expanded.filter((f) => RECOGNISED.has(f.fileName.toLowerCase()));

  const bathFile = recognised.find((f) => f.fileName.toLowerCase() === 'bathymetry.csv');
  const sonarFile = recognised.find((f) => f.fileName.toLowerCase() === 'sonar.csv');

  if (!bathFile) {
    throw new Error('No bathymetry.csv found in upload');
  }

  const warnings: string[] = [];
  const source: SourceFileMeta[] = [];
  const bathDiag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
  const bathymetry = parseQuestBathymetry(bathFile.bytes, bathDiag);
  source.push({ fileName: bathFile.fileName, byteSize: bathFile.bytes.length });
  if (bathDiag.malformedRowCount > 0) {
    warnings.push(
      `bathymetry.csv: skipped ${bathDiag.malformedRowCount} of ${bathDiag.totalRows} malformed rows`,
    );
  }

  let sonar: RawScan['sonar'] = [];
  if (sonarFile) {
    const sonarDiag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    sonar = parseQuestSonar(sonarFile.bytes, sonarDiag);
    source.push({ fileName: sonarFile.fileName, byteSize: sonarFile.bytes.length });
    if (sonarDiag.malformedRowCount > 0) {
      warnings.push(
        `sonar.csv: skipped ${sonarDiag.malformedRowCount} of ${sonarDiag.totalRows} malformed rows`,
      );
    }
  } else {
    warnings.push('sonar.csv missing — bathymetry-only mode');
  }

  return {
    scan: { device: 'quest', bathymetry, sonar, source },
    warnings,
  };
}
