import { describe, expect, it } from 'vitest';
import {
  looksLikeDeeperMobile,
  parseDeeperMobileBathymetry,
  parseQuestBathymetry,
  parseQuestSonar,
  type ParseDiagnostics,
} from '../quest';

// The parsers consume raw file bytes (never a pre-decoded string) so that a
// large scan is never materialised as one giant UTF-16 string. Tests author
// fixtures as text and encode them here.
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

const FIVE_COL = `51.7,-1.43,1.5,18.4,1717000000000
51.7,-1.43,1.6,18.4,1717000000067
0,0,1.7,18.4,1717000000134
51.7,-1.43,1.8,18.4,1717000000201
`;

const FOUR_COL = `51.7,-1.43,1.5,1717000000000
51.7,-1.43,1.6,1717000000067
`;

describe('parseQuestBathymetry', () => {
  it('parses the 5-column post-2025 firmware format', () => {
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const rows = parseQuestBathymetry(enc(FIVE_COL), diagnostics);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      lat: 51.7,
      lon: -1.43,
      depth_m: 1.5,
      temp_c: 18.4,
      ts_ms: 1717000000000,
    });
    expect(diagnostics.malformedRowCount).toBe(0);
    expect(diagnostics.totalRows).toBe(4);
  });

  it('parses the 4-column older format with temp_c absent', () => {
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const rows = parseQuestBathymetry(enc(FOUR_COL), diagnostics);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      lat: 51.7,
      lon: -1.43,
      depth_m: 1.5,
      ts_ms: 1717000000000,
    });
    expect(rows[0]?.temp_c).toBeUndefined();
  });

  it('rejects rows with a column count that is neither 4 nor 5', () => {
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    expect(() => parseQuestBathymetry(enc('a,b,c\n'), diagnostics)).toThrow(
      /expected 4 or 5 columns/i,
    );
  });

  it('skips malformed rows under the 1% threshold and counts them', () => {
    const csv = `51.7,-1.43,1.5,18.4,1717000000000
malformed_row_here
51.7,-1.43,1.6,18.4,1717000000067
51.7,-1.43,1.7,18.4,1717000000134
51.7,-1.43,1.8,18.4,1717000000201
`;
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const rows = parseQuestBathymetry(enc(csv), diagnostics);
    expect(rows).toHaveLength(4);
    expect(diagnostics.malformedRowCount).toBe(1);
  });

  it('fails when more than 1% of rows are malformed', () => {
    const lines = ['51.7,-1.43,1.5,18.4,1717000000000'];
    for (let i = 0; i < 100; i++) lines.push('garbage,line');
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    expect(() => parseQuestBathymetry(enc(lines.join('\n')), diagnostics)).toThrow(
      /malformed rows exceed/i,
    );
  });

  it('rejects a single-line stub file', () => {
    const stub = `0,0,0,0`;
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    expect(() => parseQuestBathymetry(enc(stub), diagnostics)).toThrow(/stub file/i);
  });

  it('treats rows with empty cells as malformed (not GPS-zero)', () => {
    const csv = `51.7,-1.43,1.5,18.4,1717000000000
51.7,,1.5,18.4,1717000000067
51.7,-1.43,1.5,18.4,1717000000134
51.7,-1.43,1.5,18.4,1717000000201
51.7,-1.43,1.5,18.4,1717000000268
`;
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const rows = parseQuestBathymetry(enc(csv), diagnostics);
    expect(rows).toHaveLength(4);
    expect(diagnostics.malformedRowCount).toBe(1);
    expect(rows.every((r) => r.lat === 51.7 && r.lon === -1.43)).toBe(true);
  });

  it('skips rows with the right column count but a non-numeric cell', () => {
    const csv = `51.7,-1.43,1.5,18.4,1717000000000
51.7,abc,1.5,18.4,1717000000067
51.7,-1.43,1.5,18.4,1717000000134
51.7,-1.43,1.5,18.4,1717000000201
51.7,-1.43,1.5,18.4,1717000000268
`;
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const rows = parseQuestBathymetry(enc(csv), diagnostics);
    expect(rows).toHaveLength(4);
    expect(diagnostics.malformedRowCount).toBe(1);
  });

  it('rejects a file whose every row has lat=0 and lon=0 (Deeper Start)', () => {
    const csv = `0,0,1.5,18.4,1717000000000
0,0,1.6,18.4,1717000000067
0,0,1.7,18.4,1717000000134
0,0,1.8,18.4,1717000000201
`;
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    expect(() => parseQuestBathymetry(enc(csv), diagnostics)).toThrow(/no GPS coordinates/i);
  });

  it('does not reject a file where at least one row has a GPS fix', () => {
    const csv = `0,0,1.5,18.4,1717000000000
51.7,-1.43,1.6,18.4,1717000000067
0,0,1.7,18.4,1717000000134
`;
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const rows = parseQuestBathymetry(enc(csv), diagnostics);
    expect(rows).toHaveLength(3);
  });

  it('parses CRLF line endings (Windows-exported CSV)', () => {
    const csv = '51.7,-1.43,1.5,18.4,1717000000000\r\n51.7,-1.43,1.6,18.4,1717000000067\r\n';
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const rows = parseQuestBathymetry(enc(csv), diagnostics);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.ts_ms).toBe(1717000000000);
    expect(diagnostics.malformedRowCount).toBe(0);
  });

  it('strips a leading UTF-8 BOM so the first cell parses numerically', () => {
    const csv = '\ufeff' + '51.7,-1.43,1.5,18.4,1717000000000\n51.7,-1.43,1.6,18.4,1717000000067\n';
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const rows = parseQuestBathymetry(enc(csv), diagnostics);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.lat).toBe(51.7);
  });

  it('throws on an empty file (no rows)', () => {
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    expect(() => parseQuestBathymetry(enc(''), diagnostics)).toThrow(/no rows found/i);
  });
});

describe('parseQuestSonar', () => {
  it('parses ts + variable-length amplitude rows', () => {
    const csv = `1717000000000,0,0,5,12,40,200,500
1717000000067,0,0,4,11,38,210,520,180
`;
    const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const pings = parseQuestSonar(enc(csv), diag);
    expect(pings).toHaveLength(2);
    expect(pings[0]?.ts_ms).toBe(1717000000000);
    expect(pings[0]?.amps).toBeInstanceOf(Int32Array);
    expect(Array.from(pings[0]!.amps)).toEqual([0, 0, 5, 12, 40, 200, 500]);
    expect(pings[1]?.amps.length).toBe(8);
  });

  it('skips a row with a non-integer amplitude', () => {
    const csv = `1717000000000,0,0,5,12,foo,200,500
1717000000067,0,0,4,11,38,210,520,180
1717000000134,0,0,4,11,38,210,520,180
1717000000201,0,0,4,11,38,210,520,180
1717000000268,0,0,4,11,38,210,520,180
`;
    const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const pings = parseQuestSonar(enc(csv), diag);
    expect(pings).toHaveLength(4);
    expect(diag.malformedRowCount).toBe(1);
  });

  it('fails when malformed rows exceed 1%', () => {
    const lines: string[] = [];
    lines.push('1717000000000,0,0,5,12,40,200,500');
    for (let i = 0; i < 200; i++) lines.push('garbage');
    const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    expect(() => parseQuestSonar(enc(lines.join('\n')), diag)).toThrow(/malformed rows exceed/i);
  });

  it('detects a stub file', () => {
    const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    expect(() => parseQuestSonar(enc('1,2,3'), diag)).toThrow(/stub file/i);
  });

  it('treats sonar rows with empty cells as malformed (timestamp/amp 0 collision)', () => {
    const csv = `1717000000000,0,0,5,12,40,200,500
,0,0,4,11,38,210,520,180
1717000000134,0,0,4,11,38,210,520,180
1717000000201,0,0,4,11,38,210,520,180
1717000000268,0,0,4,11,38,210,520,180
`;
    const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const pings = parseQuestSonar(enc(csv), diag);
    expect(pings).toHaveLength(4);
    expect(diag.malformedRowCount).toBe(1);
    expect(pings.every((p) => p.ts_ms !== 0)).toBe(true);
  });

  it('throws on an empty file (no rows)', () => {
    const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    expect(() => parseQuestSonar(enc(''), diag)).toThrow(/no rows found/i);
  });
});

const MOBILE_HEADER = 'latitude,longtitude,depth,temperature,time';
const MOBILE_CSV = `${MOBILE_HEADER}
48.4820,3.9191,3.028,0.0,1783174168000
,,3.028,30.6,1783174168344
,,3.070,30.6,1783174168684
48.4821,3.9192,3.049,0.0,1783174169000
,,3.049,30.8,1783174169500
`;

describe('looksLikeDeeperMobile', () => {
  it('recognises the mobile header (incl. the "longtitude" typo)', () => {
    expect(looksLikeDeeperMobile(enc(MOBILE_CSV))).toBe(true);
    expect(looksLikeDeeperMobile(enc('latitude,longitude,depth,temperature,time\n1,2,3,4,5'))).toBe(
      true,
    );
  });

  it('rejects a headerless Quest CSV', () => {
    expect(looksLikeDeeperMobile(enc(FIVE_COL))).toBe(false);
  });

  it('tolerates a UTF-8 BOM before the header', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc(MOBILE_CSV)]);
    expect(looksLikeDeeperMobile(withBom)).toBe(true);
  });
});

describe('parseDeeperMobileBathymetry', () => {
  it('parses depth/time, interpolates GPS sentinel, and drops the temp=0 sentinel', () => {
    const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const rows = parseDeeperMobileBathymetry(enc(MOBILE_CSV), diag);
    // Header skipped → 5 data rows.
    expect(rows).toHaveLength(5);
    // GPS-fix row: coords kept, temp=0 dropped (undefined, not 0).
    expect(rows[0]).toEqual({ lat: 48.482, lon: 3.9191, depth_m: 3.028, ts_ms: 1783174168000 });
    expect(rows[0]?.temp_c).toBeUndefined();
    // Blank-GPS row: coords become the (0,0) no-fix sentinel, real temp kept.
    expect(rows[1]).toEqual({ lat: 0, lon: 0, depth_m: 3.028, temp_c: 30.6, ts_ms: 1783174168344 });
    expect(diag.malformedRowCount).toBe(0);
  });

  it('counts a row with the wrong column count as malformed', () => {
    const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const csv = `${MOBILE_HEADER}
48.48,3.91,3.0,0.0,1783174168000
48.48,3.91,3.0,1783174168100
,,3.1,30.6,1783174168344
`;
    const rows = parseDeeperMobileBathymetry(enc(csv), diag);
    expect(rows).toHaveLength(2);
    expect(diag.malformedRowCount).toBe(1);
  });

  it('rejects rows with blank depth or time', () => {
    const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const csv = `${MOBILE_HEADER}
48.48,3.91,,0.0,1783174168000
48.48,3.91,3.0,0.0,
48.49,3.92,3.05,0.0,1783174168300
,,3.1,30.6,1783174168344
`;
    const rows = parseDeeperMobileBathymetry(enc(csv), diag);
    expect(rows).toHaveLength(2);
    expect(diag.malformedRowCount).toBe(2);
  });

  it('throws when no row has a GPS fix', () => {
    const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const csv = `${MOBILE_HEADER}
,,3.0,30.6,1783174168000
,,3.1,30.8,1783174168344
`;
    expect(() => parseDeeperMobileBathymetry(enc(csv), diag)).toThrow(/no gps/i);
  });

  it('throws on an empty (header-only) file', () => {
    const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    expect(() => parseDeeperMobileBathymetry(enc(MOBILE_HEADER + '\n'), diag)).toThrow(
      /no rows found/i,
    );
  });
});
