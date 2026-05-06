import type { ScaleRange } from '../../analysis/types';
import { viridisRamp } from '../colors';

export const BATHYMETRY_SOURCE_ID = 'bathymetry';
export const BATHYMETRY_LAYER_ID = 'bathymetry-fill';

export interface LayerStyle {
  source: { type: 'geojson'; data: GeoJSON.FeatureCollection };
  layer: maplibregl.LayerSpecification;
}

import type maplibregl from 'maplibre-gl';

export function buildBathymetryStyle(scale: ScaleRange): LayerStyle {
  // Build interpolate stops for fill-color: each ramp stop normalised to scale range.
  const span = Math.max(scale.max - scale.min, 1e-6);
  const colorStops = viridisRamp.flatMap(([t, hex]) => [scale.min + t * span, hex]);

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
