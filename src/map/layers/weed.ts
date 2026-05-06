import type { ScaleRange } from '../../analysis/types';
import { greensRamp } from '../colors';
import type { LayerStyle } from './bathymetry';
import type maplibregl from 'maplibre-gl';

export const WEED_SOURCE_ID = 'weed';
export const WEED_LAYER_ID = 'weed-fill';

export function buildWeedStyle(scale: ScaleRange): LayerStyle {
  const span = Math.max(scale.max - scale.min, 1e-6);
  const colorStops = greensRamp.flatMap(([t, hex]) => [scale.min + t * span, hex]);

  return {
    source: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    },
    layer: {
      id: WEED_LAYER_ID,
      type: 'fill',
      source: WEED_SOURCE_ID,
      paint: {
        'fill-color': [
          'interpolate',
          ['linear'],
          ['get', 'level'],
          ...colorStops,
        ] as unknown as maplibregl.ExpressionSpecification,
        'fill-opacity': 0.55,
      },
      layout: { visibility: 'visible' },
    } as unknown as maplibregl.LayerSpecification,
  };
}
