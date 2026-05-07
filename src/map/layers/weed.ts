import type { ScaleRange } from '../../analysis/types';
import { greensRamp, quantileColorStops } from '../colors';
import type { LayerStyle } from './bathymetry';
import type maplibregl from 'maplibre-gl';

export const WEED_SOURCE_ID = 'weed';
export const WEED_LAYER_ID = 'weed-fill';

export function buildWeedStyle(scale: ScaleRange): LayerStyle {
  const colorStops = quantileColorStops(scale.levels, greensRamp);

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
