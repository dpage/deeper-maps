import type { ScaleRange } from '../types';

/**
 * Outlier-trimmed min/max for use as a colour-scale endpoint.
 *
 * - Sorts ascending, drops `trimPct` of values from each end, returns min/max
 *   of the remainder.
 * - If trimming leaves exactly 1 value, returns the literal min/max of the
 *   input (preserves spread for the colour scale).
 * - If trimming wipes the window entirely, collapses both endpoints to the
 *   median of the input.
 * - Always guarantees `max - min >= 1e-6` so MapLibre data expressions can
 *   safely divide. See spec §6.5.
 */
export function trimmedRange(values: readonly number[], trimPct: number): ScaleRange {
  if (values.length === 0) throw new Error('trimmedRange: empty input');

  const pct = Math.max(0, Math.min(49, trimPct));
  const sorted = [...values].sort((a, b) => a - b);
  const trim = Math.ceil((sorted.length * pct) / 100);
  const window = sorted.slice(trim, sorted.length - trim);

  let min: number;
  let max: number;
  if (window.length >= 2) {
    min = window[0]!;
    max = window[window.length - 1]!;
  } else if (window.length === 1) {
    // Trimming left a single value — fall back to the literal min/max of the
    // input, preserving the spread so colour-scale endpoints stay meaningful.
    min = sorted[0]!;
    max = sorted[sorted.length - 1]!;
  } else {
    // Trimming wiped the window — collapse to the median (degenerate).
    const mid = sorted[sorted.length >> 1]!;
    min = mid;
    max = mid;
  }

  if (max - min < 1e-6) max = min + 1e-6;
  return { min, max };
}
