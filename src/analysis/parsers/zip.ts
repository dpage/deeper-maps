import { unzipSync, strFromU8 } from 'fflate';
import type { RawScan, SourceFileMeta } from './types';
import { parseQuestBathymetry, parseQuestSonar, type ParseDiagnostics } from './quest';

export interface UploadFile {
  fileName: string;
  bytes: Uint8Array;
}

export interface UploadResult {
  scan: RawScan;
  warnings: string[];
}

const RECOGNISED = new Set(['bathymetry.csv', 'sonar.csv']);

function expandZips(uploads: UploadFile[]): UploadFile[] {
  const out: UploadFile[] = [];
  for (const u of uploads) {
    if (u.fileName.toLowerCase().endsWith('.zip')) {
      const entries = unzipSync(u.bytes);
      for (const [name, bytes] of Object.entries(entries)) {
        const segments = name.split('/');
        // Skip macOS resource-fork metadata: __MACOSX/ subtree at any depth, and
        // AppleDouble (._) sidecar files. Without this filter, a Mac-zipped scan
        // can shadow real CSVs because expandZips strips parent directories.
        if (segments.includes('__MACOSX')) continue;
        const base = segments[segments.length - 1] ?? name;
        if (base.startsWith('._')) continue;
        if (base === '') continue; // directory entry
        out.push({ fileName: base, bytes });
      }
    } else {
      out.push(u);
    }
  }
  return out;
}

/**
 * Promise return is part of the public contract: Plan 2 dispatches this to a
 * Web Worker, at which point the body becomes genuinely async. Keeping the
 * signature stable now avoids a breaking API change later.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function parseQuestUpload(uploads: UploadFile[]): Promise<UploadResult> {
  const expanded = expandZips(uploads);
  const recognised = expanded.filter((f) => RECOGNISED.has(f.fileName.toLowerCase()));

  const bathFile = recognised.find((f) => f.fileName.toLowerCase() === 'bathymetry.csv');
  const sonarFile = recognised.find((f) => f.fileName.toLowerCase() === 'sonar.csv');

  if (!bathFile) {
    throw new Error('No bathymetry.csv found in upload');
  }

  const warnings: string[] = [];
  const source: SourceFileMeta[] = [];
  const bathDiag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
  const bathymetry = parseQuestBathymetry(strFromU8(bathFile.bytes), bathDiag);
  source.push({ fileName: bathFile.fileName, byteSize: bathFile.bytes.length });
  if (bathDiag.malformedRowCount > 0) {
    warnings.push(
      `bathymetry.csv: skipped ${bathDiag.malformedRowCount} of ${bathDiag.totalRows} malformed rows`,
    );
  }

  let sonar: RawScan['sonar'] = [];
  if (sonarFile) {
    const sonarDiag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    sonar = parseQuestSonar(strFromU8(sonarFile.bytes), sonarDiag);
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
