import type maplibregl from 'maplibre-gl';
import type { ScaleRange } from '../../analysis/types';
import { greensRamp } from '../colors';
import type { LayerStyle } from './bathymetry';

export const WEED_LINES_SOURCE_ID = 'weed-lines';
export const WEED_LINES_LAYER_ID = 'weed-lines-layer';

/**
 * Line-contour style for the weed layer. Renders each contour ring as a
 * coloured line (Greens ramp keyed off `level`), so the bathymetry fill
 * underneath remains visible. MapView turns this layer on (and the
 * filled `weed-fill` layer off) when both bathymetry and weed are visible.
 *
 * Default visibility is `none` because the visibility effect manages the
 * weed-fill / weed-lines toggle conditionally based on bathymetry.
 */
export function buildWeedLinesStyle(scale: ScaleRange): LayerStyle {
  const span = Math.max(scale.max - scale.min, 1e-6);
  const colorStops = greensRamp.flatMap(([t, hex]) => [scale.min + t * span, hex]);

  return {
    source: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    },
    layer: {
      id: WEED_LINES_LAYER_ID,
      type: 'line',
      source: WEED_LINES_SOURCE_ID,
      paint: {
        'line-color': [
          'interpolate',
          ['linear'],
          ['get', 'level'],
          ...colorStops,
        ] as unknown as maplibregl.ExpressionSpecification,
        'line-width': 1.2,
        'line-opacity': 0.9,
      },
      layout: { visibility: 'none' },
    } as unknown as maplibregl.LayerSpecification,
  };
}
