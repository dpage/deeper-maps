import { describe, expect, it } from 'vitest';
import { makeBath } from '../../../../test/fixtures/makeBath';
import type { BathRow } from '../../parsers/types';
import { DEFAULT_LIFTOUT_OPTIONS } from '../../constants';
import { cleanBathymetry } from '../cleanBathymetry';

describe('cleanBathymetry', () => {
  it('handles a session larger than the argument-spread limit without overflowing the stack', () => {
    // Regression: per-session t_start/t_end were computed with
    // Math.min(...tsList) / Math.max(...tsList). A single session on a large
    // (~70 MB) scan holds hundreds of thousands of pings, and spreading that
    // many arguments into a call overflows the stack ("Maximum call stack size
    // exceeded") — the actual reason large scans failed to process. 200k rows
    // is comfortably past V8's ~125k argument-count limit.
    const N = 200_000;
    const t0 = 1_700_000_000_000;
    const rows: BathRow[] = [];
    for (let i = 0; i < N; i++) {
      rows.push({ lat: 51.7, lon: -1.43, depth_m: 5, ts_ms: t0 + i * 67 });
    }
    const result = cleanBathymetry(rows, DEFAULT_LIFTOUT_OPTIONS, 0);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.t_start).toBe(t0);
    expect(result.sessions[0]?.t_end).toBe(t0 + (N - 1) * 67);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('removes duplicate timestamps preferring GPS-tagged rows', () => {
    const rows = [
      { lat: 0, lon: 0, depth_m: 1.5, ts_ms: 100 }, // no GPS
      { lat: 51.7, lon: -1.43, depth_m: 1.5, ts_ms: 100 }, // GPS-tagged
      { lat: 51.7, lon: -1.43, depth_m: 1.6, ts_ms: 167 },
      { lat: 51.7, lon: -1.43, depth_m: 1.7, ts_ms: 234 },
      { lat: 51.7, lon: -1.43, depth_m: 1.8, ts_ms: 301 },
      { lat: 51.7, lon: -1.43, depth_m: 1.9, ts_ms: 368 },
      { lat: 51.7, lon: -1.43, depth_m: 2.0, ts_ms: 435 },
    ];
    const result = cleanBathymetry(rows, DEFAULT_LIFTOUT_OPTIONS, 0);
    const tsCounts = new Map<number, number>();
    for (const r of result.rows) tsCounts.set(r.ts_ms, (tsCounts.get(r.ts_ms) ?? 0) + 1);
    expect(tsCounts.get(100)).toBe(1);
    expect(result.rows.find((r) => r.ts_ms === 100)?.lat).toBe(51.7);
  });

  it('interpolates lat/lon for non-GPS rows between two GPS rows', () => {
    const rows = [
      { lat: 51.0, lon: -1.0, depth_m: 1.5, ts_ms: 0 },
      { lat: 0, lon: 0, depth_m: 1.5, ts_ms: 100 },
      { lat: 0, lon: 0, depth_m: 1.5, ts_ms: 200 },
      { lat: 53.0, lon: -3.0, depth_m: 1.5, ts_ms: 300 },
      { lat: 53.0, lon: -3.0, depth_m: 1.5, ts_ms: 400 },
    ];
    const result = cleanBathymetry(rows, DEFAULT_LIFTOUT_OPTIONS, 0);
    expect(result.rows[1]?.lat).toBeCloseTo(51 + ((53 - 51) * 100) / 300);
    expect(result.rows[2]?.lat).toBeCloseTo(51 + ((53 - 51) * 200) / 300);
    expect(result.rows[1]?.lon).toBeCloseTo(-1 + ((-3 - -1) * 100) / 300);
  });

  it('flags lift-outs and removes them, recording the count', () => {
    const rows = makeBath({
      n: 50,
      mutator: (r, i) => {
        if (i === 25) r.depth_m = 12;
      },
    });
    const result = cleanBathymetry(rows, DEFAULT_LIFTOUT_OPTIONS, 0);
    expect(result.rows.find((r) => r.ts_ms === rows[25]!.ts_ms)).toBeUndefined();
    expect(result.liftoutsRemoved).toBe(1);
  });

  it('partitions rows into sessions on time gaps > sessionGapS', () => {
    const rows = makeBath({
      n: 20,
      mutator: (r, i) => {
        if (i >= 10) r.ts_ms += 600_000; // 10 minute gap halfway
      },
    });
    const result = cleanBathymetry(rows, DEFAULT_LIFTOUT_OPTIONS, 7);
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0]?.n_pings).toBe(10);
    expect(result.sessions[1]?.n_pings).toBe(10);
    expect(result.rows.every((r) => r.file_id === 7)).toBe(true);
  });

  it('drops rows that have no GPS interpolation source available', () => {
    const rows = [
      { lat: 0, lon: 0, depth_m: 1.5, ts_ms: 0 },
      { lat: 0, lon: 0, depth_m: 1.5, ts_ms: 100 },
      { lat: 51.7, lon: -1.43, depth_m: 1.5, ts_ms: 200 },
    ];
    const result = cleanBathymetry(rows, DEFAULT_LIFTOUT_OPTIONS, 0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.ts_ms).toBe(200);
  });
});
