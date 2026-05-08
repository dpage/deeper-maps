import type maplibregl from 'maplibre-gl';
import type { ScaleRange } from '../../analysis/types';
import { quantileColorStops, plasmaRamp } from '../colors';
import type { LayerStyle } from './bathymetry';

export const TEMPERATURE_SOURCE_ID = 'temperature';
export const TEMPERATURE_LAYER_ID = 'temperature-fill';

export function buildTemperatureColorExpression(
  scale: ScaleRange,
): maplibregl.ExpressionSpecification {
  const colorStops = quantileColorStops(scale.levels, plasmaRamp);
  return [
    'interpolate',
    ['linear'],
    ['get', 'level'],
    ...colorStops,
  ] as unknown as maplibregl.ExpressionSpecification;
}

export function buildTemperatureStyle(scale: ScaleRange): LayerStyle {
  return {
    source: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    },
    layer: {
      id: TEMPERATURE_LAYER_ID,
      type: 'fill',
      source: TEMPERATURE_SOURCE_ID,
      paint: {
        'fill-color': buildTemperatureColorExpression(scale),
        'fill-opacity': 0.55,
      },
      layout: { visibility: 'visible' },
    } as unknown as maplibregl.LayerSpecification,
  };
}
