import type { ScaleRange } from '../../analysis/types';
import { ylOrRdRamp } from '../colors';
import type { LayerStyle } from './bathymetry';
import type maplibregl from 'maplibre-gl';

export const FISH_DENSITY_SOURCE_ID = 'fish-density';
export const FISH_DENSITY_LAYER_ID = 'fish-density-circles';

export function buildFishDensityStyle(scale: ScaleRange): LayerStyle {
  const span = Math.max(scale.max - scale.min, 1e-6);
  const colorStops = ylOrRdRamp.flatMap(([t, hex]) => [scale.min + t * span, hex]);

  return {
    source: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    },
    layer: {
      id: FISH_DENSITY_LAYER_ID,
      type: 'circle',
      source: FISH_DENSITY_SOURCE_ID,
      paint: {
        // radius = sqrt(n_pings), clamped to [3, 14] px
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['sqrt', ['get', 'n_pings']],
          0,
          3,
          5,
          6,
          10,
          10,
          20,
          14,
        ] as unknown as maplibregl.ExpressionSpecification,
        'circle-color': [
          'interpolate',
          ['linear'],
          ['get', 'fish_rate'],
          ...colorStops,
        ] as unknown as maplibregl.ExpressionSpecification,
        'circle-opacity': 0.85,
        'circle-stroke-width': 0.5,
        'circle-stroke-color': '#222',
      },
      layout: { visibility: 'visible' },
    } as unknown as maplibregl.LayerSpecification,
  };
}
