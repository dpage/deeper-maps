import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { useDeeperMapsStore } from '../state/store';
import type { BaseLayerId, LayerVisibility } from '../storage/types';
import {
  BATHYMETRY_LAYER_ID,
  BATHYMETRY_SOURCE_ID,
  buildBathymetryStyle,
} from './layers/bathymetry';
import {
  FISH_DENSITY_LAYER_ID,
  FISH_DENSITY_SOURCE_ID,
  buildFishDensityStyle,
} from './layers/fishDensity';
import {
  SWEET_SPOTS_LAYER_ID,
  SWEET_SPOTS_SOURCE_ID,
  buildSweetSpotsStyle,
} from './layers/sweetSpots';
import { WEED_LAYER_ID, WEED_SOURCE_ID, buildWeedStyle } from './layers/weed';

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Tiles © Esri',
    },
  },
  layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
};

const LAYER_VISIBILITY_KEYS: Array<{ key: keyof LayerVisibility; layerId: string }> = [
  { key: 'bathymetry', layerId: BATHYMETRY_LAYER_ID },
  { key: 'weed', layerId: WEED_LAYER_ID },
  { key: 'fishDensity', layerId: FISH_DENSITY_LAYER_ID },
  { key: 'sweetSpots', layerId: SWEET_SPOTS_LAYER_ID },
];

function styleFor(base: BaseLayerId): maplibregl.StyleSpecification {
  return base === 'satellite' ? SATELLITE_STYLE : OSM_STYLE;
}

export function MapView(): JSX.Element {
  const mapRef = useRef<MapLibreMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const layerBundle = useDeeperMapsStore((s) => s.layerBundle);
  const activeScanId = useDeeperMapsStore((s) => s.activeScanId);
  const scans = useDeeperMapsStore((s) => s.scans);
  const activeScan = activeScanId ? scans[activeScanId] : undefined;

  /* c8 ignore start - WebGL-dependent code path; covered by Plan 3's Playwright E2E */
  // NOTE: depending on activeScan?.baseLayer here means a base-layer toggle
  // tears down and rebuilds the map (the cleanup function calls map.remove()).
  // Acceptable for v1; revisit if base-layer switching becomes a hot path.
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(activeScan?.baseLayer ?? 'osm'),
      center: [-1.43, 51.74],
      zoom: 14,
      attributionControl: false,
    });
    mapRef.current = map;
    map.on('load', () => {
      // Register all four layer source/layer pairs; sources start with empty data.
      const fallback = { min: 0, max: 1 };
      for (const builder of [
        buildBathymetryStyle(fallback),
        buildWeedStyle(fallback),
        buildFishDensityStyle(fallback),
        buildSweetSpotsStyle(),
      ]) {
        // All four layers are non-background (fill/circle), so .source is always present.
        const sourceId = (builder.layer as { source: string }).source;
        map.addSource(sourceId, builder.source);
        map.addLayer(builder.layer);
      }
      // If a bundle is already in the store (cache hit before mount), push it now.
      // Otherwise the layerBundle effect's dep won't refire and overlays would
      // render empty until the next bundle update.
      const snapshot = useDeeperMapsStore.getState();
      const initialBundle = snapshot.layerBundle;
      if (initialBundle) {
        type SetDataSrc = { setData: (d: GeoJSON.FeatureCollection) => void };
        (map.getSource(BATHYMETRY_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
          initialBundle.bathymetry,
        );
        (map.getSource(WEED_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
          initialBundle.weed,
        );
        (map.getSource(FISH_DENSITY_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
          initialBundle.fishDensity,
        );
        (map.getSource(SWEET_SPOTS_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
          initialBundle.sweetSpots,
        );
      }
      // Apply current layer visibility (in case activeScan is set before mount).
      const initialScan = snapshot.activeScanId ? snapshot.scans[snapshot.activeScanId] : undefined;
      if (initialScan) {
        for (const { key, layerId } of LAYER_VISIBILITY_KEYS) {
          map.setLayoutProperty(
            layerId,
            'visibility',
            initialScan.layerVisibility[key] ? 'visible' : 'none',
          );
        }
      }
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [activeScan?.baseLayer]);

  // Update sources when layerBundle changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layerBundle) return;
    if (!map.isStyleLoaded()) return; // initial-mount path handles cache hits
    type SetDataSrc = { setData: (d: GeoJSON.FeatureCollection) => void };
    (map.getSource(BATHYMETRY_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
      layerBundle.bathymetry,
    );
    (map.getSource(WEED_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(layerBundle.weed);
    (map.getSource(FISH_DENSITY_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
      layerBundle.fishDensity,
    );
    (map.getSource(SWEET_SPOTS_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
      layerBundle.sweetSpots,
    );
  }, [layerBundle]);

  // Update visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeScan) return;
    if (!map.isStyleLoaded()) return; // initial-mount path applies on load
    for (const { key, layerId } of LAYER_VISIBILITY_KEYS) {
      const visible = activeScan.layerVisibility[key];
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    }
  }, [activeScan?.layerVisibility, activeScan]);
  /* c8 ignore stop */

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 400 }} />;
}
