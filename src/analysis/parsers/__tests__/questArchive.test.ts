// @vitest-environment node
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildQuestZip,
  concatCsv,
  extractQuestCsvs,
  mergeQuestArchives,
  serialiseBathymetry,
  type QuestCsvs,
} from '../questArchive';
import { parseQuestUpload } from '../zip';
import type { BathRow } from '../types';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

function buildZip(files: Record<string, string | Uint8Array>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    entries[name] = typeof content === 'string' ? strToU8(content) : content;
  }
  return zipSync(entries);
}

const BATH = '51.7,-1.43,1.5,18.4,1717000000000\n51.8,-1.44,2.0,18.1,1717000000067\n';
const SONAR = '1717000000000,0,0,5,12,40\n1717000000067,0,0,6,14,42\n';

describe('extractQuestCsvs', () => {
  it('extracts bathymetry + sonar bytes from a zip', () => {
    const zip = buildZip({ 'bathymetry.csv': BATH, 'sonar.csv': SONAR, README: 'ignore' });
    const csvs = extractQuestCsvs([{ fileName: 'scan.zip', bytes: zip }]);
    expect(strFromU8(csvs.bathymetry)).toBe(BATH);
    expect(csvs.sonar && strFromU8(csvs.sonar)).toBe(SONAR);
  });

  it('extracts from a bare pair of CSV files (no zip)', () => {
    const csvs = extractQuestCsvs([
      { fileName: 'bathymetry.csv', bytes: enc(BATH) },
      { fileName: 'sonar.csv', bytes: enc(SONAR) },
    ]);
    expect(strFromU8(csvs.bathymetry)).toBe(BATH);
    expect(strFromU8(csvs.sonar!)).toBe(SONAR);
  });

  it('returns sonar: null when sonar.csv is absent', () => {
    const zip = buildZip({ 'bathymetry.csv': BATH });
    const csvs = extractQuestCsvs([{ fileName: 'scan.zip', bytes: zip }]);
    expect(csvs.sonar).toBeNull();
  });

  it('ignores __MACOSX resource-fork entries', () => {
    const zip = buildZip({
      '__MACOSX/bathymetry.csv': '9,9,9,9,9\n',
      'bathymetry.csv': BATH,
      'sonar.csv': SONAR,
    });
    const csvs = extractQuestCsvs([{ fileName: 'mac.zip', bytes: zip }]);
    expect(strFromU8(csvs.bathymetry)).toBe(BATH);
  });

  it('throws when no bathymetry.csv is present', () => {
    const zip = buildZip({ 'sonar.csv': SONAR });
    expect(() => extractQuestCsvs([{ fileName: 'scan.zip', bytes: zip }])).toThrow(
      /no bathymetry/i,
    );
  });

  it('normalises a Deeper mobile scan_data CSV to headerless bathymetry.csv', () => {
    const mobile =
      'latitude,longtitude,depth,temperature,time\n' +
      '48.4820,3.9191,3.028,0.0,1783174168000\n' + // GPS row, temp sentinel
      ',,3.070,30.6,1783174168684\n' + // blank GPS → 0,0; real temp
      '48.4821,3.9192,3.049,0.0,1783174169000\n';
    const csvs = extractQuestCsvs([{ fileName: 'scan_data_x.csv', bytes: enc(mobile) }]);
    expect(csvs.sonar).toBeNull();
    const text = strFromU8(csvs.bathymetry);
    expect(text).not.toContain('latitude'); // header stripped
    const rows = text.trim().split('\n');
    expect(rows).toHaveLength(3);
    // Blank GPS became 0,0; temp forward-filled (first real reading is 30.6).
    expect(rows[0]).toBe('48.482,3.9191,3.028,30.6,1783174168000');
    expect(rows[1]).toBe('0,0,3.07,30.6,1783174168684');
  });
});

describe('serialiseBathymetry', () => {
  const row = (lat: number, lon: number, depth: number, ts: number, temp?: number): BathRow => {
    const r: BathRow = { lat, lon, depth_m: depth, ts_ms: ts };
    if (temp !== undefined) r.temp_c = temp;
    return r;
  };

  it('emits 5 columns and forward-fills missing temperature', () => {
    const out = serialiseBathymetry([
      row(51.7, -1.43, 1.5, 1000), // no temp yet → filled from first reading
      row(51.7, -1.43, 1.6, 1100, 18.4),
      row(51.7, -1.43, 1.7, 1200), // gap → carries 18.4
      row(51.7, -1.43, 1.8, 1300, 18.9),
    ]);
    expect(strFromU8(out).trim().split('\n')).toEqual([
      '51.7,-1.43,1.5,18.4,1000',
      '51.7,-1.43,1.6,18.4,1100',
      '51.7,-1.43,1.7,18.4,1200',
      '51.7,-1.43,1.8,18.9,1300',
    ]);
  });

  it('emits 4 columns when no row has temperature', () => {
    const out = serialiseBathymetry([row(51.7, -1.43, 1.5, 1000), row(51.7, -1.43, 1.6, 1100)]);
    expect(strFromU8(out).trim().split('\n')).toEqual([
      '51.7,-1.43,1.5,1000',
      '51.7,-1.43,1.6,1100',
    ]);
  });
});

describe('concatCsv', () => {
  it('joins parts with a single newline, adding one when missing', () => {
    const out = concatCsv([enc('a,b'), enc('c,d\n'), enc('e,f')]);
    expect(strFromU8(out)).toBe('a,b\nc,d\ne,f\n');
  });

  it('preserves existing trailing newlines without doubling them', () => {
    const out = concatCsv([enc('a\n'), enc('b\n')]);
    expect(strFromU8(out)).toBe('a\nb\n');
  });

  it('drops empty parts', () => {
    const out = concatCsv([enc(''), enc('a\n'), new Uint8Array(0), enc('b')]);
    expect(strFromU8(out)).toBe('a\nb\n');
  });

  it('returns an empty buffer when all parts are empty', () => {
    expect(concatCsv([enc(''), new Uint8Array(0)]).length).toBe(0);
  });
});

describe('buildQuestZip', () => {
  it('produces a zip re-importable by parseQuestUpload (with sonar)', async () => {
    const rows: string[] = [];
    const sonarRows: string[] = [];
    for (let i = 0; i < 50; i++) {
      rows.push(`51.7,-1.43,1.5,18.4,${1717000000000 + i * 67}`);
      sonarRows.push(`${1717000000000 + i * 67},${[0, 0, 0, 5, 12, 40, 200, 500].join(',')}`);
    }
    const zip = buildQuestZip({
      bathymetry: enc(rows.join('\n') + '\n'),
      sonar: enc(sonarRows.join('\n') + '\n'),
    });
    const entries = unzipSync(zip);
    expect(Object.keys(entries).sort()).toEqual(['bathymetry.csv', 'sonar.csv']);

    const result = await parseQuestUpload([{ fileName: 'out.zip', bytes: zip }]);
    expect(result.scan.bathymetry).toHaveLength(50);
    expect(result.scan.sonar).toHaveLength(50);
  });

  it('omits sonar.csv when sonar is null', () => {
    const zip = buildQuestZip({ bathymetry: enc(BATH), sonar: null });
    expect(Object.keys(unzipSync(zip))).toEqual(['bathymetry.csv']);
  });

  it('is deterministic for identical input', () => {
    const a = buildQuestZip({ bathymetry: enc(BATH), sonar: enc(SONAR) });
    const b = buildQuestZip({ bathymetry: enc(BATH), sonar: enc(SONAR) });
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('mergeQuestArchives', () => {
  it('concatenates bathymetry and sonar across archives', () => {
    const a: QuestCsvs = { bathymetry: enc('a1\n'), sonar: enc('s1\n') };
    const b: QuestCsvs = { bathymetry: enc('a2\n'), sonar: enc('s2\n') };
    const merged = mergeQuestArchives([a, b]);
    expect(strFromU8(merged.bathymetry)).toBe('a1\na2\n');
    expect(strFromU8(merged.sonar!)).toBe('s1\ns2\n');
  });

  it('keeps sonar when at least one archive has it', () => {
    const merged = mergeQuestArchives([
      { bathymetry: enc('a1\n'), sonar: null },
      { bathymetry: enc('a2\n'), sonar: enc('s2\n') },
    ]);
    expect(strFromU8(merged.sonar!)).toBe('s2\n');
  });

  it('yields sonar: null when no archive has sonar', () => {
    const merged = mergeQuestArchives([
      { bathymetry: enc('a1\n'), sonar: null },
      { bathymetry: enc('a2\n'), sonar: null },
    ]);
    expect(merged.sonar).toBeNull();
  });

  it('throws on an empty archive list', () => {
    expect(() => mergeQuestArchives([])).toThrow(/no archives/i);
  });

  it('round-trips a merge back through the parser as two sessions', async () => {
    // Two scans of the "same lake" a day apart. After merge + rebuild, the
    // parser should read all rows; the pipeline partitions them into sessions.
    const dayMs = 86_400_000;
    const scanRows = (base: number): string =>
      Array.from({ length: 30 }, (_, i) => `51.7,-1.43,1.5,18.4,${base + i * 67}`).join('\n') +
      '\n';
    const first = extractQuestCsvs([
      { fileName: 'bathymetry.csv', bytes: enc(scanRows(1717000000000)) },
    ]);
    const second = extractQuestCsvs([
      { fileName: 'bathymetry.csv', bytes: enc(scanRows(1717000000000 + dayMs)) },
    ]);
    const merged = mergeQuestArchives([first, second]);
    const zip = buildQuestZip(merged);
    const result = await parseQuestUpload([{ fileName: 'merged.zip', bytes: zip }]);
    expect(result.scan.bathymetry).toHaveLength(60);
  });
});

describe('cross-format export & merge', () => {
  const mobileCsv = (base: number): Uint8Array => {
    const lines = ['latitude,longtitude,depth,temperature,time'];
    for (let i = 0; i < 20; i++) {
      // Alternate GPS-fix (temp sentinel 0) and blank-GPS (real temp) rows.
      if (i % 2 === 0) lines.push(`48.482,3.919,3.0,0.0,${base + i * 100}`);
      else lines.push(`,,3.05,30.6,${base + i * 100}`);
    }
    return enc(lines.join('\n') + '\n');
  };
  const questCsvs = (base: number): QuestCsvs => ({
    bathymetry: enc(
      Array.from({ length: 20 }, (_, i) => `51.7,-1.43,1.5,18.4,${base + i * 100}`).join('\n') +
        '\n',
    ),
    sonar: enc(
      Array.from({ length: 20 }, (_, i) => `${base + i * 100},0,0,5,12,40,200,500`).join('\n') +
        '\n',
    ),
  });

  it('exports a mobile scan as a re-importable bathymetry-only zip', async () => {
    const csvs = extractQuestCsvs([{ fileName: 'scan_data.csv', bytes: mobileCsv(1717000000000) }]);
    const zip = buildQuestZip(csvs);
    const result = await parseQuestUpload([{ fileName: 'export.zip', bytes: zip }]);
    expect(result.scan.bathymetry).toHaveLength(20);
    expect(result.scan.sonar).toHaveLength(0);
    // Temperature survived the round-trip (forward-filled, no 0 sentinel).
    expect(result.scan.bathymetry.every((b) => b.temp_c === 30.6)).toBe(true);
  });

  it('merges a mobile scan into a Quest scan, keeping the Quest sonar', async () => {
    const quest = questCsvs(1717000000000);
    const mobile = extractQuestCsvs([
      { fileName: 'scan_data.csv', bytes: mobileCsv(1900000000000) },
    ]);
    const merged = mergeQuestArchives([quest, mobile]);
    const zip = buildQuestZip(merged);
    const result = await parseQuestUpload([{ fileName: 'merged.zip', bytes: zip }]);
    // Combined bathymetry from both; sonar retained from the Quest scan.
    expect(result.scan.bathymetry).toHaveLength(40);
    expect(result.scan.sonar).toHaveLength(20);
  });
});
