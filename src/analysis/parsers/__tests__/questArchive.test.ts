// @vitest-environment node
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildQuestZip,
  concatCsv,
  extractQuestCsvs,
  mergeQuestArchives,
  type QuestCsvs,
} from '../questArchive';
import { parseQuestUpload } from '../zip';

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
