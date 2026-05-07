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
  const frameRequestSeq = useDeeperMapsStore((s) => s.frameRequestSeq);

  // The store bumps `frameRequestSeq` every time the user picks a scan
  // (`setActiveScan` or `saveAndAnalyse`), regardless of whether the active id
  // actually changed. Reset `lastFramedScanIdRef` so the next layerBundle
  // effect snaps the camera back — this restores reframing on re-selection of
  // the already-active scan (e.g. user clicks the same scan a second time).
  /* c8 ignore start - WebGL-dependent code path; covered by Plan 3's Playwright E2E */
  useEffect(() => {
    lastFramedScanIdRef.current = null;
  }, [frameRequestSeq]);
  /* c8 ignore stop */

  /* c8 ignore start - WebGL-dependent code path; covered by Plan 3's Playwright E2E */
  /**
   * Adds the four overlay sources/layers (with empty data) and the fish-icon
   * SDF image, then replays the current store snapshot's layerBundle data
   * and visibility settings — and re-frames the map on the active scan's
   * bounds if this is the first frame for that scan. Used both by the
   * initial map `load` handler AND the `style.load` handler that fires after
   * a base-layer swap (which wipes sources/layers but preserves view).
   *
   * `duration` controls the fitBounds animation: 0 for the cold-start path
   * (avoid an unwanted fly), 800 for runtime style swaps (smooth reframe).
   */
  const addOverlaysAndReplay = (map: MapLibreMap, duration: number): void => {
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
    const initialScanId = snapshot.activeScanId;
    const initialScan = initialScanId ? snapshot.scans[initialScanId] : undefined;
    if (initialScan) {
      for (const { key, layerId } of LAYER_VISIBILITY_KEYS) {
        map.setLayoutProperty(
          layerId,
          'visibility',
          initialScan.layerVisibility[key] ? 'visible' : 'none',
        );
      }
    }
    if (initialBundle?.bounds && initialScanId && lastFramedScanIdRef.current !== initialScanId) {
      map.fitBounds([initialBundle.bounds.sw, initialBundle.bounds.ne], {
        padding: 40,
        maxZoom: 16,
        duration,
      });
      lastFramedScanIdRef.current = initialScanId;
    }
  };
  /* c8 ignore stop */

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
      addOverlaysAndReplay(map, 0);
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
      addOverlaysAndReplay(map, 800);
    });
  }, [activeScan?.baseLayer]);
  /* c8 ignore stop */

  /* c8 ignore start - WebGL-dependent code path; covered by Plan 3's Playwright E2E */
  // Update sources when layerBundle changes; fitBounds on first-land per scan.
  // If the style is mid-swap (e.g. user just clicked a different scan whose
  // saved baseLayer differs from the current one), defer the apply via
  // `style.load` instead of bailing — otherwise the new bundle is dropped on
  // the floor and the resulting addOverlaysAndReplay (which reads the
  // snapshot at *its* fire time) may also miss it depending on timing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layerBundle) return;
    const apply = (): void => {
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
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      void map.once('style.load', apply);
    }
  }, [layerBundle, activeScanId]);
  /* c8 ignore stop */

  /* c8 ignore start - WebGL-dependent code path; covered by Plan 3's Playwright E2E */
  // Update visibility. Same defer pattern as the layerBundle effect: if the
  // style is mid-swap, queue the visibility apply on style.load rather than
  // bailing (which would lose the toggle if the user flipped a layer during
  // a base-style swap).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeScan) return;
    const apply = (): void => {
      for (const { key, layerId } of LAYER_VISIBILITY_KEYS) {
        const visible = activeScan.layerVisibility[key];
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      void map.once('style.load', apply);
    }
  }, [activeScan?.layerVisibility, activeScan]);
  /* c8 ignore stop */

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 400 }} />;
}
