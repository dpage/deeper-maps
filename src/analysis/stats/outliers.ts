import type { BathRow } from '../parsers/types';
import type { LiftoutOptions } from '../types';

// Matches deeper_analysis.py:flag_liftouts (line 124)
const ROLLING_MIN_PERIODS = 5;

function median(sortedAsc: number[]): number {
  const n = sortedAsc.length;
  if (n === 0) return NaN;
  const mid = n >> 1;
  return n % 2 === 1 ? sortedAsc[mid]! : (sortedAsc[mid - 1]! + sortedAsc[mid]!) / 2;
}

/**
 * Centred rolling median.
 *
 * - Window must be odd.
 * - `minPeriods` is the number of values that must be available in the
 *   centred windowed slice for a median to be computed. If fewer values
 *   are available at a given index (typically near the edges of `values`),
 *   the input value at that index is returned unchanged.
 * - Matches the centre-aligned behaviour of
 *   `pd.Series.rolling(W, center=True, min_periods=N).median()`. Production
 *   callers pass `minPeriods=5` to match `deeper_analysis.py:flag_liftouts`
 *   (line 124).
 */
export function rollingMedian(
  values: readonly number[],
  window: number,
  minPeriods: number,
): number[] {
  if (window % 2 === 0) throw new Error('rollingMedian: window must be odd');
  const half = (window - 1) / 2;
  const out: number[] = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length - 1, i + half);
    const slice = values.slice(lo, hi + 1);
    if (slice.length < minPeriods) {
      out[i] = values[i]!;
      continue;
    }
    const sorted = [...slice].sort((a, b) => a - b);
    out[i] = median(sorted);
  }
  return out;
}

/** Median absolute deviation from the median. */
export function mad(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const m = median(sorted);
  const devs = values.map((v) => Math.abs(v - m));
  const devsSorted = devs.sort((a, b) => a - b);
  return median(devsSorted);
}

/**
 * Two-stage lift-out detection (per HANDOFF.md and deeper_analysis.py:flag_liftouts).
 *
 *   1. Hard threshold on absolute depth.
 *   2. Per-session rolling-median outlier rule:
 *        deviation > rollingMAD * madMultiplier + madOffsetM
 *
 * Sessions are identified by gaps > sessionGapS between consecutive ts_ms values.
 *
 * Returns a parallel boolean array; `true` at index i means row i is a lift-out.
 */
export function detectLiftouts(rows: readonly BathRow[], opts: LiftoutOptions): boolean[] {
  const n = rows.length;
  const flags: boolean[] = new Array<boolean>(n).fill(false);

  // Hard threshold first.
  for (let i = 0; i < n; i++) {
    if (rows[i]!.depth_m > opts.hardThresholdM) flags[i] = true;
  }

  // Identify sessions by ts gap.
  const sessionStarts: number[] = [0];
  for (let i = 1; i < n; i++) {
    const gapS = (rows[i]!.ts_ms - rows[i - 1]!.ts_ms) / 1000;
    if (gapS > opts.sessionGapS) sessionStarts.push(i);
  }
  sessionStarts.push(n);

  // Per-session rolling-median outliers.
  for (let s = 0; s < sessionStarts.length - 1; s++) {
    const lo = sessionStarts[s]!;
    const hi = sessionStarts[s + 1]!;
    const depths = rows.slice(lo, hi).map((r) => r.depth_m);
    if (depths.length < 5) continue;
    const med = rollingMedian(depths, opts.rollingWindow, ROLLING_MIN_PERIODS);
    const dev = depths.map((d, i) => Math.abs(d - med[i]!));
    const rollingMad = rollingMedian(dev, opts.rollingWindow, ROLLING_MIN_PERIODS);
    for (let i = 0; i < depths.length; i++) {
      const threshold = rollingMad[i]! * opts.madMultiplier + opts.madOffsetM;
      if (dev[i]! > threshold) flags[lo + i] = true;
    }
  }

  return flags;
}
