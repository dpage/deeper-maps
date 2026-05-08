import type maplibregl from 'maplibre-gl';
import type { ScaleRange } from '../../analysis/types';
import { quantileColorStops, viridisRamp } from '../colors';
import type { LayerStyle } from './bathymetry';

export const BATHYMETRY_LINES_SOURCE_ID = 'bathymetry-lines';
export const BATHYMETRY_LINES_LAYER_ID = 'bathymetry-lines-layer';

/**
 * Line-contour style for the bathymetry layer. Renders each contour ring as a
 * coloured line (Viridis ramp keyed off `level`, matching the bathymetry
 * fill's depth-to-colour mapping), so the weed fill underneath remains
 * visible. MapView turns this layer on (and the filled `bathymetry-fill`
 * layer off) when both bathymetry and weed are visible — depth contours
 * read as the cultural "elevation contour" cue over the weed colour.
 *
 * Default visibility is `none` because the visibility effect manages the
 * bath-fill / bath-lines toggle conditionally based on weed visibility.
 */
export function buildBathymetryLinesColorExpression(
  scale: ScaleRange,
): maplibregl.ExpressionSpecification {
  const colorStops = quantileColorStops(scale.levels, viridisRamp);
  return [
    'interpolate',
    ['linear'],
    ['get', 'level'],
    ...colorStops,
  ] as unknown as maplibregl.ExpressionSpecification;
}

export function buildBathymetryLinesStyle(scale: ScaleRange): LayerStyle {
  return {
    source: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    },
    layer: {
      id: BATHYMETRY_LINES_LAYER_ID,
      type: 'line',
      source: BATHYMETRY_LINES_SOURCE_ID,
      paint: {
        'line-color': buildBathymetryLinesColorExpression(scale),
        'line-width': 1.2,
        'line-opacity': 0.9,
      },
      layout: { visibility: 'none' },
    } as unknown as maplibregl.LayerSpecification,
  };
}
