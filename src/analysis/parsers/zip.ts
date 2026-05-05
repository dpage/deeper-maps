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
        // Strip any leading directory components (Deeper sometimes nests files).
        const base = name.split('/').pop() ?? name;
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
  source.push({ fileName: 'bathymetry.csv', bytes: bathFile.bytes.length });

  let sonar: RawScan['sonar'] = [];
  if (sonarFile) {
    const sonarDiag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    sonar = parseQuestSonar(strFromU8(sonarFile.bytes), sonarDiag);
    source.push({ fileName: 'sonar.csv', bytes: sonarFile.bytes.length });
  } else {
    warnings.push('sonar.csv missing — bathymetry-only mode');
  }

  return {
    scan: { device: 'quest', bathymetry, sonar, source },
    warnings,
  };
}
