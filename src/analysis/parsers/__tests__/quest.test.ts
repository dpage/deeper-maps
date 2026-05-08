import { describe, expect, it } from 'vitest';
import { parseQuestBathymetry, parseQuestSonar, type ParseDiagnostics } from '../quest';

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
    const rows = parseQuestBathymetry(FIVE_COL, diagnostics);
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
    const rows = parseQuestBathymetry(FOUR_COL, diagnostics);
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
    expect(() => parseQuestBathymetry('a,b,c\n', diagnostics)).toThrow(/expected 4 or 5 columns/i);
  });

  it('skips malformed rows under the 1% threshold and counts them', () => {
    const csv = `51.7,-1.43,1.5,18.4,1717000000000
malformed_row_here
51.7,-1.43,1.6,18.4,1717000000067
51.7,-1.43,1.7,18.4,1717000000134
51.7,-1.43,1.8,18.4,1717000000201
`;
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const rows = parseQuestBathymetry(csv, diagnostics);
    expect(rows).toHaveLength(4);
    expect(diagnostics.malformedRowCount).toBe(1);
  });

  it('fails when more than 1% of rows are malformed', () => {
    const lines = ['51.7,-1.43,1.5,18.4,1717000000000'];
    for (let i = 0; i < 100; i++) lines.push('garbage,line');
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    expect(() => parseQuestBathymetry(lines.join('\n'), diagnostics)).toThrow(
      /malformed rows exceed/i,
    );
  });

  it('rejects a single-line stub file', () => {
    const stub = `0,0,0,0`;
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    expect(() => parseQuestBathymetry(stub, diagnostics)).toThrow(/stub file/i);
  });

  it('treats rows with empty cells as malformed (not GPS-zero)', () => {
    const csv = `51.7,-1.43,1.5,18.4,1717000000000
51.7,,1.5,18.4,1717000000067
51.7,-1.43,1.5,18.4,1717000000134
51.7,-1.43,1.5,18.4,1717000000201
51.7,-1.43,1.5,18.4,1717000000268
`;
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const rows = parseQuestBathymetry(csv, diagnostics);
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
    const rows = parseQuestBathymetry(csv, diagnostics);
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
    expect(() => parseQuestBathymetry(csv, diagnostics)).toThrow(/no GPS coordinates/i);
  });

  it('does not reject a file where at least one row has a GPS fix', () => {
    const csv = `0,0,1.5,18.4,1717000000000
51.7,-1.43,1.6,18.4,1717000000067
0,0,1.7,18.4,1717000000134
`;
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const rows = parseQuestBathymetry(csv, diagnostics);
    expect(rows).toHaveLength(3);
  });
});

describe('parseQuestSonar', () => {
  it('parses ts + variable-length amplitude rows', () => {
    const csv = `1717000000000,0,0,5,12,40,200,500
1717000000067,0,0,4,11,38,210,520,180
`;
    const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const pings = parseQuestSonar(csv, diag);
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
    const pings = parseQuestSonar(csv, diag);
    expect(pings).toHaveLength(4);
    expect(diag.malformedRowCount).toBe(1);
  });

  it('fails when malformed rows exceed 1%', () => {
    const lines: string[] = [];
    lines.push('1717000000000,0,0,5,12,40,200,500');
    for (let i = 0; i < 200; i++) lines.push('garbage');
    const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    expect(() => parseQuestSonar(lines.join('\n'), diag)).toThrow(/malformed rows exceed/i);
  });

  it('detects a stub file', () => {
    const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    expect(() => parseQuestSonar('1,2,3', diag)).toThrow(/stub file/i);
  });

  it('treats sonar rows with empty cells as malformed (timestamp/amp 0 collision)', () => {
    const csv = `1717000000000,0,0,5,12,40,200,500
,0,0,4,11,38,210,520,180
1717000000134,0,0,4,11,38,210,520,180
1717000000201,0,0,4,11,38,210,520,180
1717000000268,0,0,4,11,38,210,520,180
`;
    const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const pings = parseQuestSonar(csv, diag);
    expect(pings).toHaveLength(4);
    expect(diag.malformedRowCount).toBe(1);
    expect(pings.every((p) => p.ts_ms !== 0)).toBe(true);
  });
});
