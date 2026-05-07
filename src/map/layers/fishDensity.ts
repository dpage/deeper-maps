import type { ScaleRange } from '../../analysis/types';
import { ylOrRdRamp } from '../colors';
import type { LayerStyle } from './bathymetry';
import type maplibregl from 'maplibre-gl';

export const FISH_DENSITY_SOURCE_ID = 'fish-density';
export const FISH_DENSITY_LAYER_ID = 'fish-density-circles';
export const FISH_ICON_NAME = 'fish-icon';

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
      type: 'symbol',
      source: FISH_DENSITY_SOURCE_ID,
      layout: {
        'icon-image': FISH_ICON_NAME,
        // Size scales with √n_pings (confidence by sample count). Stops chosen
        // so a typical cell (n_pings ≈ 10) lands around 0.6, while sparse
        // cells stay legible.
        'icon-size': [
          'interpolate',
          ['linear'],
          ['sqrt', ['get', 'n_pings']],
          0,
          0.35,
          5,
          0.55,
          10,
          0.8,
          20,
          1.1,
        ] as unknown as maplibregl.ExpressionSpecification,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        // Keep fish horizontal regardless of map rotation (viewport-aligned).
        'icon-rotation-alignment': 'viewport',
        'icon-pitch-alignment': 'viewport',
        visibility: 'visible',
      },
      paint: {
        'icon-color': [
          'interpolate',
          ['linear'],
          ['get', 'fish_rate'],
          ...colorStops,
        ] as unknown as maplibregl.ExpressionSpecification,
        'icon-opacity': 0.95,
        'icon-halo-color': '#222',
        'icon-halo-width': 0.6,
      },
    } as unknown as maplibregl.LayerSpecification,
  };
}
