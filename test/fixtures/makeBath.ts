import type { BathRow } from '../../src/analysis/parsers/types';

export interface MakeBathOpts {
  /** Number of rows. */
  n: number;
  /** Starting timestamp (ms). */
  t0?: number;
  /** Inter-ping interval in ms (~67 ms = 15 Hz). */
  dtMs?: number;
  /** Constant lat/lon used for every row (override per row via `mutator`). */
  lat?: number;
  lon?: number;
  /** Constant depth used for every row (override per row via `mutator`). */
  depth?: number;
  /** Whether to include temp_c (default: true, value 18). */
  withTemp?: boolean;
  /** Mutator called for each row before it's added — lets tests inject lift-outs, gaps etc. */
  mutator?: (row: BathRow, i: number) => void;
}

export function makeBath(opts: MakeBathOpts): BathRow[] {
  const t0 = opts.t0 ?? 1_700_000_000_000;
  const dt = opts.dtMs ?? 67;
  const rows: BathRow[] = [];
  for (let i = 0; i < opts.n; i++) {
    const row: BathRow = {
      lat: opts.lat ?? 51.7,
      lon: opts.lon ?? -1.43,
      depth_m: opts.depth ?? 1.5,
      ts_ms: t0 + i * dt,
    };
    if (opts.withTemp ?? true) row.temp_c = 18;
    opts.mutator?.(row, i);
    rows.push(row);
  }
  return rows;
}
