/**
 * Colour ramps for the four overlay layers, encoded as [stop, hex] pairs
 * suitable for MapLibre `interpolate` paint expressions.
 *
 * Stops are normalised to [0, 1]; consumers must scale by the layer's
 * trimmed range from LayerBundle.scales.
 *
 * Source: matplotlib's `viridis`, `Greens`, `YlOrRd` colour maps,
 * 9-step sample. `viridisRamp` is REVERSED (deep = dark) per the spec
 * §6.1: bathymetry uses viridis_r so deeper water reads darker.
 */
export type ColorStop = readonly [number, string];

export const viridisRamp: readonly ColorStop[] = [
  [0.0, '#fde725'],
  [0.125, '#bddf26'],
  [0.25, '#7ad151'],
  [0.375, '#44bf70'],
  [0.5, '#22a884'],
  [0.625, '#21918c'],
  [0.75, '#2a788e'],
  [0.875, '#414487'],
  [1.0, '#440154'],
];

export const greensRamp: readonly ColorStop[] = [
  [0.0, '#f7fcf5'],
  [0.125, '#e5f5e0'],
  [0.25, '#c7e9c0'],
  [0.375, '#a1d99b'],
  [0.5, '#74c476'],
  [0.625, '#41ab5d'],
  [0.75, '#238b45'],
  [0.875, '#006d2c'],
  [1.0, '#00441b'],
];

export const ylOrRdRamp: readonly ColorStop[] = [
  [0.0, '#ffffcc'],
  [0.125, '#ffeda0'],
  [0.25, '#fed976'],
  [0.375, '#feb24c'],
  [0.5, '#fd8d3c'],
  [0.625, '#fc4e2a'],
  [0.75, '#e31a1c'],
  [0.875, '#bd0026'],
  [1.0, '#800026'],
];

/**
 * Diverging cool→warm ramp for the temperature layer. Source:
 * matplotlib's `RdYlBu` colour map, 9-step sample, reversed so
 * cold reads blue and warm reads red — the cultural water-temperature
 * convention (vs. the YlOrRd ramp which fish-density uses for "amount").
 */
export const rdYlBuRRamp: readonly ColorStop[] = [
  [0.0, '#2c7bb6'],
  [0.125, '#abd9e9'],
  [0.25, '#e0f3f8'],
  [0.375, '#ffffbf'],
  [0.5, '#fee090'],
  [0.625, '#fdae61'],
  [0.75, '#f46d43'],
  [0.875, '#d7191c'],
  [1.0, '#a50026'],
];

/**
 * Build MapLibre `interpolate` stops mapping each quantile-level value to a
 * colour sampled from `ramp` at evenly-spaced positions. Used to colour
 * contour fills and lines so dense regions of the data get a wider colour
 * range than they would under linear interpolation between min and max.
 */
export function quantileColorStops(
  levels: readonly number[],
  ramp: readonly ColorStop[],
): (number | string)[] {
  if (levels.length === 0) return [0, ramp[0]![1], 1, ramp[ramp.length - 1]![1]];
  const stops: (number | string)[] = [];
  const n = levels.length;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    stops.push(levels[i]!, sampleRamp(ramp, t));
  }
  return stops;
}

export function sampleRamp(ramp: readonly ColorStop[], t: number): string {
  for (let i = 0; i < ramp.length - 1; i++) {
    const [t1, c1] = ramp[i]!;
    const [t2, c2] = ramp[i + 1]!;
    if (t <= t2) {
      const f = (t - t1) / Math.max(t2 - t1, 1e-12);
      return lerpHex(c1, c2, Math.max(0, Math.min(1, f)));
    }
  }
  return ramp[ramp.length - 1]![1];
}

export function lerpHex(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = parseHex(c1);
  const [r2, g2, b2] = parseHex(c2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
