import { describe, expect, it } from 'vitest';
import { DEFAULT_CELL_OPTIONS } from '../../constants';
import type { PerPingRow } from '../../types';
import { aggregateCells } from '../aggregateCells';

const ping = (lat: number, lon: number, fish = 0, weed = 0): PerPingRow => ({
  ts_ms: 0,
  lat,
  lon,
  depth_m: 1.5,
  weed_height_m: weed,
  fish_count: fish,
  fish_max_amp: fish > 0 ? 800 : 0,
  hard_bottom_peak: 1500,
  noise_floor: 5,
  session_id: 0,
});

describe('aggregateCells', () => {
  it('returns origin = (min lat, min lon)', () => {
    const rows = [ping(51.0, -1.0), ping(52.0, -2.0)];
    const cells = aggregateCells({ rows }, DEFAULT_CELL_OPTIONS);
    expect(cells.origin).toEqual({ lat: 51, lon: -2 });
  });

  it('groups pings within a cell', () => {
    const rows: PerPingRow[] = [];
    for (let i = 0; i < 5; i++) rows.push(ping(51.7, -1.43));
    const cells = aggregateCells({ rows }, DEFAULT_CELL_OPTIONS);
    expect(cells.rows).toHaveLength(1);
    expect(cells.rows[0]?.n_pings).toBe(5);
  });

  it('drops cells with fewer than minPingsPerCell pings', () => {
    const rows = [ping(51.7, -1.43), ping(51.7, -1.43)];
    const cells = aggregateCells({ rows }, DEFAULT_CELL_OPTIONS);
    expect(cells.rows).toHaveLength(0);
  });

  it('computes fish_rate as fraction of pings with at least one fish', () => {
    const rows: PerPingRow[] = [];
    for (let i = 0; i < 10; i++) rows.push(ping(51.7, -1.43, i < 3 ? 1 : 0));
    const cells = aggregateCells({ rows }, DEFAULT_CELL_OPTIONS);
    expect(cells.rows[0]?.fish_rate).toBeCloseTo(0.3);
  });

  it('records the ping timestamp range (t_start_ms / t_end_ms) for each cell', () => {
    const rows: PerPingRow[] = [
      { ...ping(51.7, -1.43), ts_ms: 5000 },
      { ...ping(51.7, -1.43), ts_ms: 1000 },
      { ...ping(51.7, -1.43), ts_ms: 9000 },
    ];
    const cells = aggregateCells({ rows }, DEFAULT_CELL_OPTIONS);
    expect(cells.rows[0]?.t_start_ms).toBe(1000);
    expect(cells.rows[0]?.t_end_ms).toBe(9000);
  });

  it('throws when number of cells exceeds the safety guard', () => {
    const rows: PerPingRow[] = [];
    // 100 001 distinct points at 1 m spacing → > 100 000 cells at cellSize 0.01 m.
    for (let i = 0; i < 100_001; i++) {
      const dLat = i * 0.00001; // ~1.11 m per step
      rows.push(ping(51.7 + dLat, -1.43));
    }
    expect(() => aggregateCells({ rows }, { cellSizeM: 0.01, minPingsPerCell: 1 })).toThrow(
      /too many cells/i,
    );
  });

  it('handles empty input and propagates temp_c into mean_temp_c', () => {
    const empty = aggregateCells({ rows: [] }, DEFAULT_CELL_OPTIONS);
    expect(empty.rows).toHaveLength(0);
    expect(empty.origin).toEqual({ lat: 0, lon: 0 });

    const rows: PerPingRow[] = [];
    for (let i = 0; i < 5; i++) {
      const r = ping(51.7, -1.43);
      r.temp_c = 18 + i;
      rows.push(r);
    }
    const cells = aggregateCells({ rows }, DEFAULT_CELL_OPTIONS);
    expect(cells.rows[0]?.mean_temp_c).toBeCloseTo(20);
  });
});
