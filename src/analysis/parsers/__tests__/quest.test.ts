import { describe, expect, it } from 'vitest';
import { parseQuestBathymetry, type ParseDiagnostics } from '../quest';

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

  it('detects and rejects a stub file (< 256 bytes or < 3 rows)', () => {
    const stub = `0,0,0,0`;
    const diagnostics: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    expect(() => parseQuestBathymetry(stub, diagnostics)).toThrow(/stub file/i);
  });
});
