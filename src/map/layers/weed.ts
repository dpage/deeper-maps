import type { ScaleRange } from '../../analysis/types';
import { greensRamp, quantileColorStops } from '../colors';
import type { LayerStyle } from './bathymetry';
import type maplibregl from 'maplibre-gl';

export const WEED_SOURCE_ID = 'weed';
export const WEED_LAYER_ID = 'weed-fill';

export function buildWeedColorExpression(
  scale: ScaleRange,
): maplibregl.ExpressionSpecification {
  const colorStops = quantileColorStops(scale.levels, greensRamp);
  return [
    'interpolate',
    ['linear'],
    ['get', 'level'],
    ...colorStops,
  ] as unknown as maplibregl.ExpressionSpecification;
}

export function buildWeedStyle(scale: ScaleRange): LayerStyle {
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
        'fill-color': buildWeedColorExpression(scale),
        'fill-opacity': 0.55,
      },
      layout: { visibility: 'visible' },
    } as unknown as maplibregl.LayerSpecification,
  };
}
