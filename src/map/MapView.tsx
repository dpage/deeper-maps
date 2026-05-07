import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { useDeeperMapsStore } from '../state/store';
import type { BaseLayerId, LayerVisibility } from '../storage/types';
import { buildFishIcon } from './fishIcon';
import {
  BATHYMETRY_LAYER_ID,
  BATHYMETRY_SOURCE_ID,
  buildBathymetryStyle,
} from './layers/bathymetry';
import {
  FISH_DENSITY_LAYER_ID,
  FISH_DENSITY_SOURCE_ID,
  FISH_ICON_NAME,
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

type SetDataSrc = { setData: (d: GeoJSON.FeatureCollection) => void };

/**
 * Adds the four overlay sources/layers (with empty data) and the fish-icon
 * SDF image, then replays the current store snapshot's layerBundle data and
 * visibility settings. Used both by the initial map `load` handler AND the
 * `style.load` handler that fires after a base-layer swap (which wipes
 * sources/layers but preserves pan/zoom/bearing).
 */
function addOverlaysAndReplay(map: MapLibreMap): void {
  // Register the fish-icon SDF before the fish-density layer references it.
  if (!map.hasImage(FISH_ICON_NAME)) {
    map.addImage(FISH_ICON_NAME, buildFishIcon(), { sdf: true });
  }

  const fallback = { min: 0, max: 1 };
  for (const builder of [
    buildBathymetryStyle(fallback),
    buildWeedStyle(fallback),
    buildFishDensityStyle(fallback),
    buildSweetSpotsStyle(),
  ]) {
    const sourceId = (builder.layer as { source: string }).source;
    map.addSource(sourceId, builder.source);
    map.addLayer(builder.layer);
  }

  const snapshot = useDeeperMapsStore.getState();
  const initialBundle = snapshot.layerBundle;
  if (initialBundle) {
    (map.getSource(BATHYMETRY_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
      initialBundle.bathymetry,
    );
    (map.getSource(WEED_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(initialBundle.weed);
    (map.getSource(FISH_DENSITY_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
      initialBundle.fishDensity,
    );
    (map.getSource(SWEET_SPOTS_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
      initialBundle.sweetSpots,
    );
  }
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
}

export function MapView(): JSX.Element {
  const mapRef = useRef<MapLibreMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Tracks the last scanId we framed the map on, so we only fitBounds on
  // first land of a new scan (not on threshold-driven re-renders).
  const lastFramedScanIdRef = useRef<string | null>(null);
  // Tracks the baseLayer we last applied via setStyle, to avoid no-op
  // style.load cycles when other parts of activeScan change.
  const lastBaseLayerRef = useRef<BaseLayerId | null>(null);
  const layerBundle = useDeeperMapsStore((s) => s.layerBundle);
  const activeScanId = useDeeperMapsStore((s) => s.activeScanId);
  const scans = useDeeperMapsStore((s) => s.scans);
  const activeScan = activeScanId ? scans[activeScanId] : undefined;

  /* c8 ignore start - WebGL-dependent code path; covered by Plan 3's Playwright E2E */
  // Mount-effect: create the map exactly once. Base-layer changes are handled
  // by a separate effect (setStyle) so pan/zoom/bearing survive the swap.
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;
    const initialBase = useDeeperMapsStore.getState().activeScanId
      ? (useDeeperMapsStore.getState().scans[useDeeperMapsStore.getState().activeScanId ?? '']
          ?.baseLayer ?? 'osm')
      : 'osm';
    lastBaseLayerRef.current = initialBase;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(initialBase),
      center: [-1.43, 51.74],
      zoom: 14,
      attributionControl: false,
    });
    mapRef.current = map;
    map.on('load', () => {
      addOverlaysAndReplay(map);
      // After the load-time replay, frame the map on the active scan's data
      // (if there is one). This handles the cache-hit-before-mount path.
      const snapshot = useDeeperMapsStore.getState();
      const bundle = snapshot.layerBundle;
      const scanId = snapshot.activeScanId;
      if (bundle?.bounds && scanId && scanId !== lastFramedScanIdRef.current) {
        map.fitBounds([bundle.bounds.sw, bundle.bounds.ne], {
          padding: 40,
          maxZoom: 16,
          duration: 0,
        });
        lastFramedScanIdRef.current = scanId;
      }
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);
  /* c8 ignore stop */

  /* c8 ignore start - WebGL-dependent code path; covered by Plan 3's Playwright E2E */
  // Base-layer swap: replace the style without rebuilding the map. setStyle
  // preserves pan/zoom/bearing automatically; we re-add overlays in style.load.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const target = activeScan?.baseLayer ?? 'osm';
    if (lastBaseLayerRef.current === target) return;
    lastBaseLayerRef.current = target;
    map.setStyle(styleFor(target), { diff: false });
    void map.once('style.load', () => {
      addOverlaysAndReplay(map);
    });
  }, [activeScan?.baseLayer]);
  /* c8 ignore stop */

  /* c8 ignore start - WebGL-dependent code path; covered by Plan 3's Playwright E2E */
  // Update sources when layerBundle changes; fitBounds on first-land per scan.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layerBundle) return;
    if (!map.isStyleLoaded()) return; // initial-mount path handles cache hits
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
    if (layerBundle.bounds && activeScanId && activeScanId !== lastFramedScanIdRef.current) {
      map.fitBounds([layerBundle.bounds.sw, layerBundle.bounds.ne], {
        padding: 40,
        maxZoom: 16,
        duration: 800,
      });
      lastFramedScanIdRef.current = activeScanId;
    }
  }, [layerBundle, activeScanId]);
  /* c8 ignore stop */

  /* c8 ignore start - WebGL-dependent code path; covered by Plan 3's Playwright E2E */
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
