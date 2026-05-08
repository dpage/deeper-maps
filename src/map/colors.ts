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
 * Sequential ramp for the temperature layer. Source: matplotlib's `plasma`
 * colour map, 9-step sample. Perceptually uniform; reads as "more intensity
 * = brighter" via dark purple → magenta → orange → yellow. Chosen over a
 * diverging cool-to-warm ramp because a single scan covers a narrow range
 * (typically 4 °C) where the diverging midpoint coincides with the data
 * mean and washes out colour variation across the cluster.
 */
export const plasmaRamp: readonly ColorStop[] = [
  [0.0, '#0d0887'],
  [0.125, '#46039f'],
  [0.25, '#7201a8'],
  [0.375, '#9c179e'],
  [0.5, '#bd3786'],
  [0.625, '#d8576b'],
  [0.75, '#ed7953'],
  [0.875, '#fb9f3a'],
  [1.0, '#fdca26'],
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
