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
