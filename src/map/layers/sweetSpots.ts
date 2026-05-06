import type { LayerStyle } from './bathymetry';
import type maplibregl from 'maplibre-gl';

export const SWEET_SPOTS_SOURCE_ID = 'sweet-spots';
export const SWEET_SPOTS_LAYER_ID = 'sweet-spots-circles';

export function buildSweetSpotsStyle(): LayerStyle {
  return {
    source: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    },
    layer: {
      id: SWEET_SPOTS_LAYER_ID,
      type: 'circle',
      source: SWEET_SPOTS_SOURCE_ID,
      paint: {
        'circle-radius': 8,
        'circle-color': ['get', 'color'] as unknown as maplibregl.ExpressionSpecification,
        'circle-opacity': 1,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
      },
      layout: { visibility: 'visible' },
    } as unknown as maplibregl.LayerSpecification,
  };
}
