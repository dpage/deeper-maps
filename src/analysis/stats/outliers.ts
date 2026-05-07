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
 * Three-stage lift-out detection.
 *
 *   1. Hard threshold on absolute depth.
 *   2. Per-session rolling-median outlier rule:
 *        deviation > rollingMAD * madMultiplier + madOffsetM
 *      (Matches HANDOFF.md / deeper_analysis.py:flag_liftouts.)
 *   3. Global-MAD pass over the survivors of (1)+(2). Computes the median
 *      and MAD over all not-yet-flagged depths and flags any survivor that
 *      sits more than `globalMadMultiplier * MAD + madOffsetM` ABOVE the
 *      global median. Iterates up to `MAX_GLOBAL_PASSES` times so multi-
 *      modal lift-outs (boat parked at multiple distinct depths during one
 *      trip) get caught — each iteration shrinks the survivor set, lowers
 *      the median + MAD, and exposes more lift-outs that were hiding
 *      behind the previous (lift-out-polluted) statistics.
 *
 * Stage 3 catches sustained lift-outs (e.g. boat resting on a bank for more
 * than `rollingWindow` consecutive pings) that the per-session rolling-
 * median pass misses because the cluster pollutes its own local window.
 *
 * Note on direction: stage 3 only flags depths ABOVE the median +
 * threshold, never below. Lift-outs always read deeper than reality (boat
 * in air or pinging the bank); a too-shallow reading is a real shallow
 * spot, not a lift-out. Setting `globalMadMultiplier` to a very large value
 * (e.g. `Infinity`) effectively disables stage 3.
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

  // Global-MAD pass over the survivors. Iterates so multi-modal lift-outs
  // (multiple distinct lift-out depth tiers) all get exposed in turn.
  const MAX_GLOBAL_PASSES = 5;
  for (let pass = 0; pass < MAX_GLOBAL_PASSES; pass++) {
    const survivorDepths: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!flags[i]) survivorDepths.push(rows[i]!.depth_m);
    }
    if (survivorDepths.length < 5) break;
    const sorted = [...survivorDepths].sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1]!;
    const devs = sorted.map((d) => Math.abs(d - med)).sort((a, b) => a - b);
    const globalMad = devs[devs.length >> 1]!;
    const cutoff = med + opts.globalMadMultiplier * globalMad + opts.madOffsetM;
    let flaggedThisPass = 0;
    for (let i = 0; i < n; i++) {
      if (flags[i]) continue;
      // Above-median gate: never flag values below the median (real shallow
      // pings, not lift-outs).
      if (rows[i]!.depth_m > cutoff) {
        flags[i] = true;
        flaggedThisPass++;
      }
    }
    if (flaggedThisPass === 0) break;
  }

  return flags;
}
