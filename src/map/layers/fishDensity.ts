import type { ScaleRange } from '../../analysis/types';
import type { LayerStyle } from './bathymetry';
import type maplibregl from 'maplibre-gl';

export const FISH_DENSITY_SOURCE_ID = 'fish-density';
export const FISH_DENSITY_LAYER_ID = 'fish-density-heat';

/**
 * Per-point heatmap weight from a cell's fish rate, normalised so the scan's
 * trimmed maximum rate contributes full weight. A cell with no fish contributes
 * nothing, so the heatmap only warms up where fish were actually detected —
 * rather than the previous blanket of overlapping fish icons that covered the
 * whole scanned area regardless of how few fish were seen.
 */
export function buildFishDensityWeightExpression(
  scale: ScaleRange,
): maplibregl.ExpressionSpecification {
  const max = scale.max > 0 ? scale.max : 1;
  return [
    'interpolate',
    ['linear'],
    ['get', 'fish_rate'],
    0,
    0,
    max,
    1,
  ] as unknown as maplibregl.ExpressionSpecification;
}

// Transparent where there are no fish, warming yellow → orange → red as
// detections concentrate. YlOrRd family, to match the legend's fish swatch.
const HEATMAP_COLOR = [
  'interpolate',
  ['linear'],
  ['heatmap-density'],
  0,
  'rgba(0,0,0,0)',
  0.15,
  'rgba(255,237,160,0.55)',
  0.4,
  'rgba(254,178,76,0.72)',
  0.7,
  'rgba(240,59,32,0.85)',
  1,
  'rgba(189,0,38,0.95)',
];

export function buildFishDensityStyle(_scale: ScaleRange): LayerStyle {
  return {
    source: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    },
    layer: {
      id: FISH_DENSITY_LAYER_ID,
      type: 'heatmap',
      source: FISH_DENSITY_SOURCE_ID,
      paint: {
        'heatmap-weight': buildFishDensityWeightExpression(_scale),
        // Blend neighbouring cells into a smooth field; grow the radius with
        // zoom so it stays cell-scaled rather than a fixed screen size.
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 6, 14, 12, 17, 22, 20, 40],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 16, 1, 20, 1.4],
        'heatmap-color': HEATMAP_COLOR,
        'heatmap-opacity': 0.75,
      } as unknown as maplibregl.LayerSpecification['paint'],
      layout: { visibility: 'visible' },
    } as unknown as maplibregl.LayerSpecification,
  };
}
