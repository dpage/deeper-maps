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
export function trimmedRange(
  values: readonly number[],
  trimPct: number,
): { min: number; max: number } {
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

/**
 * Compute N contour level thresholds at evenly-spaced QUANTILE positions of
 * the input data. With skewed data (e.g. lake depths that cluster around one
 * value, or weed thickness near zero), this produces level breaks where the
 * data actually lives — denser bands in the dense region — instead of the
 * naive linear-min-to-max spacing which wastes thresholds on empty range.
 *
 * Output is strictly increasing (epsilons inserted on ties so MapLibre's
 * `interpolate` expression accepts the stops). Returns N values; degenerate
 * inputs (empty array, fewer than 2 distinct values) fall back to evenly-
 * spaced values in [0, 1] or [min, min + epsilons].
 */
export function computeContourLevels(values: readonly number[], n: number): number[] {
  if (n < 2) return values.length > 0 ? [values[0]!] : [0];
  if (values.length === 0) {
    return Array.from({ length: n }, (_, i) => i / (n - 1));
  }
  const sorted = [...values].sort((a, b) => a - b);
  const N = sorted.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const idx = Math.min(Math.round(t * (N - 1)), N - 1);
    out.push(sorted[idx]!);
  }
  // Enforce strictly increasing (MapLibre interpolate requires it).
  for (let i = 1; i < out.length; i++) {
    if (out[i]! <= out[i - 1]!) {
      out[i] = out[i - 1]! + 1e-9;
    }
  }
  return out;
}
