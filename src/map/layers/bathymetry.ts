import type { ScaleRange } from '../../analysis/types';
import { quantileColorStops, viridisRamp } from '../colors';

export const BATHYMETRY_SOURCE_ID = 'bathymetry';
export const BATHYMETRY_LAYER_ID = 'bathymetry-fill';

export interface LayerStyle {
  source: { type: 'geojson'; data: GeoJSON.FeatureCollection };
  layer: maplibregl.LayerSpecification;
}

import type maplibregl from 'maplibre-gl';

export function buildBathymetryStyle(scale: ScaleRange): LayerStyle {
  // Build interpolate stops for fill-color from the quantile-based level
  // schedule, so dense regions of the depth distribution receive a wider
  // colour range than the linear-min-to-max mapping would give.
  const colorStops = quantileColorStops(scale.levels, viridisRamp);

  return {
    source: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    },
    layer: {
      id: BATHYMETRY_LAYER_ID,
      type: 'fill',
      source: BATHYMETRY_SOURCE_ID,
      paint: {
        'fill-color': [
          'interpolate',
          ['linear'],
          ['get', 'level'],
          ...colorStops,
        ] as unknown as maplibregl.ExpressionSpecification,
        'fill-opacity': 0.65,
      },
      layout: { visibility: 'visible' },
    } as unknown as maplibregl.LayerSpecification,
  };
}
