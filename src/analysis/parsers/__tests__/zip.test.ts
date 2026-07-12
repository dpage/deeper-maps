// @vitest-environment node
import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseQuestUpload } from '../zip';

function buildZip(files: Record<string, string | Uint8Array>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    entries[name] = typeof content === 'string' ? strToU8(content) : content;
  }
  return zipSync(entries);
}

const VALID_BATH = (() => {
  const lines: string[] = [];
  for (let i = 0; i < 50; i++) {
    lines.push(`51.7,-1.43,1.5,18.4,${1717000000000 + i * 67}`);
  }
  return lines.join('\n');
})();

const VALID_SONAR = (() => {
  const lines: string[] = [];
  for (let i = 0; i < 50; i++) {
    lines.push(`${1717000000000 + i * 67},${[0, 0, 0, 5, 12, 40, 200, 500].join(',')}`);
  }
  return lines.join('\n');
})();

describe('parseQuestUpload (zip)', () => {
  it('parses bathymetry + sonar from a zip', async () => {
    const zip = buildZip({
      'bathymetry.csv': VALID_BATH,
      'sonar.csv': VALID_SONAR,
      README: 'this is metadata, ignore me',
    });
    const result = await parseQuestUpload([{ fileName: 'scan.zip', bytes: zip }]);
    expect(result.scan.device).toBe('quest');
    expect(result.scan.bathymetry).toHaveLength(50);
    expect(result.scan.sonar).toHaveLength(50);
    expect(result.warnings).toEqual([]);
  });

  it('parses bathymetry + sonar from a folder/file list (no zip)', async () => {
    const result = await parseQuestUpload([
      { fileName: 'bathymetry.csv', bytes: new TextEncoder().encode(VALID_BATH) },
      { fileName: 'sonar.csv', bytes: new TextEncoder().encode(VALID_SONAR) },
    ]);
    expect(result.scan.bathymetry).toHaveLength(50);
    expect(result.scan.sonar).toHaveLength(50);
  });

  it('runs degraded analysis when sonar.csv is missing (warn, do not fail)', async () => {
    const zip = buildZip({ 'bathymetry.csv': VALID_BATH });
    const result = await parseQuestUpload([{ fileName: 'scan.zip', bytes: zip }]);
    expect(result.scan.bathymetry).toHaveLength(50);
    expect(result.scan.sonar).toHaveLength(0);
    expect(result.warnings).toContain('sonar.csv missing — bathymetry-only mode');
  });

  it('fails when bathymetry.csv is missing', async () => {
    const zip = buildZip({ 'sonar.csv': VALID_SONAR });
    await expect(parseQuestUpload([{ fileName: 'scan.zip', bytes: zip }])).rejects.toThrow(
      /no bathymetry/i,
    );
  });

  it('silently ignores unrecognised files (e.g. depth_map_data.csv duplicate, README)', async () => {
    const zip = buildZip({
      'bathymetry.csv': VALID_BATH,
      'sonar.csv': VALID_SONAR,
      'depth_map_data.csv': VALID_BATH,
      README: 'ignore me',
    });
    const result = await parseQuestUpload([{ fileName: 'scan.zip', bytes: zip }]);
    expect(result.scan.bathymetry).toHaveLength(50);
    expect(result.scan.source.map((s) => s.fileName).sort()).toEqual([
      'bathymetry.csv',
      'sonar.csv',
    ]);
  });

  it('ignores __MACOSX/ resource-fork entries (Mac-zipped uploads)', async () => {
    const zip = buildZip({
      '__MACOSX/bathymetry.csv': '999,888,777,666,555\n', // macOS garbage
      'bathymetry.csv': VALID_BATH,
      'sonar.csv': VALID_SONAR,
    });
    const r = await parseQuestUpload([{ fileName: 'mac.zip', bytes: zip }]);
    expect(r.scan.bathymetry).toHaveLength(50);
    expect(r.scan.bathymetry[0]?.lat).toBeCloseTo(51.7);
  });

  it('ignores AppleDouble ._ resource-fork files', async () => {
    const zip = buildZip({
      '._bathymetry.csv': new Uint8Array([0x00, 0x05, 0x16, 0x07]), // binary garbage
      'bathymetry.csv': VALID_BATH,
      'sonar.csv': VALID_SONAR,
    });
    const r = await parseQuestUpload([{ fileName: 'apple.zip', bytes: zip }]);
    expect(r.scan.bathymetry).toHaveLength(50);
  });

  it('routes a Deeper mobile scan_data CSV (header, blank GPS, temp sentinel) to bathymetry-only', async () => {
    const csv =
      'latitude,longtitude,depth,temperature,time\n' +
      '48.4820,3.9191,3.028,0.0,1783174168000\n' +
      ',,3.028,30.6,1783174168344\n' +
      ',,3.070,30.6,1783174168684\n' +
      '48.4821,3.9192,3.049,0.0,1783174169000\n' +
      ',,3.049,30.8,1783174169500\n';
    const result = await parseQuestUpload([
      { fileName: 'scan_data_20260704160928.csv', bytes: new TextEncoder().encode(csv) },
    ]);
    expect(result.scan.bathymetry).toHaveLength(5);
    expect(result.scan.sonar).toHaveLength(0);
    // temp=0 sentinel dropped; real temps kept.
    expect(result.scan.bathymetry[0]?.temp_c).toBeUndefined();
    expect(result.scan.bathymetry[1]?.temp_c).toBe(30.6);
    expect(result.warnings.some((w) => /no sonar data/i.test(w))).toBe(true);
  });

  it('warns when a parser skips malformed rows', async () => {
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) {
      lines.push(`51.7,-1.43,1.5,18.4,${1717000000000 + i * 67}`);
    }
    lines[10] = ',,,'; // malformed (4 cols, all empty)
    const sonarLines: string[] = [];
    for (let i = 0; i < 50; i++) {
      sonarLines.push(`${1717000000000 + i * 67},${[0, 0, 0, 5, 12, 40, 200, 500].join(',')}`);
    }
    sonarLines[20] = `${1717000001000},0,0,5,12,foo,200,500`; // non-integer amp
    const zip = buildZip({
      'bathymetry.csv': lines.join('\n'),
      'sonar.csv': sonarLines.join('\n'),
    });
    const r = await parseQuestUpload([{ fileName: 'scan.zip', bytes: zip }]);
    expect(r.scan.bathymetry).toHaveLength(49);
    expect(r.scan.sonar).toHaveLength(49);
    expect(r.warnings.some((w) => w.includes('bathymetry.csv') && w.includes('skipped 1'))).toBe(
      true,
    );
    expect(r.warnings.some((w) => w.includes('sonar.csv') && w.includes('skipped 1'))).toBe(true);
  });
});
