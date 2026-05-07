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
import { WEED_LINES_LAYER_ID, WEED_LINES_SOURCE_ID, buildWeedLinesStyle } from './layers/weedLines';

// `maxzoom` on the raster source caps the highest zoom level at which MapLibre
// will request tiles. Beyond it, MapLibre re-uses (overzooms) the highest
// available tiles instead of fetching 404s — the user sees a slightly pixelated
// version of what they had, not the "Map data not yet available" placeholder.
// 19 is the published native max for both OSM (https://wiki.openstreetmap.org/wiki/Zoom_levels)
// and Esri World Imagery in most regions.
const RASTER_SOURCE_MAX_ZOOM = 19;

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: RASTER_SOURCE_MAX_ZOOM,
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
      maxzoom: RASTER_SOURCE_MAX_ZOOM,
      attribution: 'Tiles © Esri',
    },
  },
  layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
};

// Layers whose visibility maps 1:1 to a single LayerVisibility flag.
// `weed` is handled specially (see `applyVisibility`) because it toggles
// between the filled and line-style weed layers depending on whether
// bathymetry is also visible.
const LAYER_VISIBILITY_KEYS: Array<{ key: keyof LayerVisibility; layerId: string }> = [
  { key: 'bathymetry', layerId: BATHYMETRY_LAYER_ID },
  { key: 'fishDensity', layerId: FISH_DENSITY_LAYER_ID },
  { key: 'sweetSpots', layerId: SWEET_SPOTS_LAYER_ID },
];

/**
 * Apply the given scan's layerVisibility flags to all overlay layers.
 *
 * Simple layers (bathymetry, fish density, sweet spots) map 1:1 from a
 * boolean visibility flag to `setLayoutProperty(layerId, 'visibility', ...)`.
 *
 * Weed is special: when both bathymetry and weed are visible, we render
 * weed as line contours (so the bathymetry colour shows through cleanly).
 * Otherwise — weed alone, or weed off — we render the filled contours
 * (current behaviour) or hide both.
 */
function applyVisibility(map: MapLibreMap, scan: { layerVisibility: LayerVisibility }): void {
  for (const { key, layerId } of LAYER_VISIBILITY_KEYS) {
    map.setLayoutProperty(layerId, 'visibility', scan.layerVisibility[key] ? 'visible' : 'none');
  }
  const weedOn = scan.layerVisibility.weed;
  const bathOn = scan.layerVisibility.bathymetry;
  map.setLayoutProperty(WEED_LAYER_ID, 'visibility', weedOn && !bathOn ? 'visible' : 'none');
  map.setLayoutProperty(WEED_LINES_LAYER_ID, 'visibility', weedOn && bathOn ? 'visible' : 'none');
}

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
  // Tracks whether our overlay sources/layers have been (re-)added since the
  // last setStyle. MapLibre's `isStyleLoaded()` flips to true as soon as the
  // BASE style parses, but our overlay sources are only re-attached inside the
  // `style.load` handler — so `isStyleLoaded()` is NOT a safe gate for
  // `getSource(...).setData(...)`. This ref is.
  const overlaysReadyRef = useRef(false);
  const layerBundle = useDeeperMapsStore((s) => s.layerBundle);
  const activeScanId = useDeeperMapsStore((s) => s.activeScanId);
  const scans = useDeeperMapsStore((s) => s.scans);
  const activeScan = activeScanId ? scans[activeScanId] : undefined;
  const baseLayer = useDeeperMapsStore((s) => s.baseLayer);
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
    // Layer order matters — `addLayer` appends, and later layers render on
    // top of earlier ones. Weed-lines sit between weed-fill and fish-density
    // so they render OVER the bathymetry and weed-fill but UNDER the
    // fish-density and sweet-spot markers.
    for (const builder of [
      buildBathymetryStyle(fallback),
      buildWeedStyle(fallback),
      buildWeedLinesStyle(fallback),
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
      (map.getSource(WEED_LINES_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
        initialBundle.weedLines,
      );
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
      applyVisibility(map, initialScan);
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
    const initialBase = useDeeperMapsStore.getState().baseLayer;
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
      overlaysReadyRef.current = true;
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
    const target = baseLayer;
    if (lastBaseLayerRef.current === target) return;
    lastBaseLayerRef.current = target;
    // Mark overlays as not-yet-ready BEFORE setStyle so any layerBundle/
    // visibility effects firing in the same render cycle defer their work.
    overlaysReadyRef.current = false;
    // Register the listener BEFORE setStyle in case setStyle dispatches
    // style.load synchronously for cheap raster styles.
    void map.once('style.load', () => {
      addOverlaysAndReplay(map, 800);
      overlaysReadyRef.current = true;
    });
    map.setStyle(styleFor(target), { diff: false });
  }, [baseLayer]);
  /* c8 ignore stop */

  /* c8 ignore start - WebGL-dependent code path; covered by Plan 3's Playwright E2E */
  // Update sources when layerBundle changes; fitBounds on first-land per scan.
  // We gate on our own `overlaysReadyRef` rather than `map.isStyleLoaded()` —
  // after `map.setStyle({ diff: false })`, `isStyleLoaded()` flips to true as
  // soon as the BASE style parses, but our overlay sources are not re-added
  // until the `style.load` callback registered by the base-layer effect runs.
  // Calling `getSource(...)` between those two events returns null and the
  // optional-chained `setData` silently drops the update, so we defer instead.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layerBundle) return;
    const apply = (): void => {
      (map.getSource(BATHYMETRY_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
        layerBundle.bathymetry,
      );
      (map.getSource(WEED_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(layerBundle.weed);
      (map.getSource(WEED_LINES_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
        layerBundle.weedLines,
      );
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
    if (overlaysReadyRef.current) {
      apply();
    } else {
      void map.once('style.load', apply);
    }
  }, [layerBundle, activeScanId]);
  /* c8 ignore stop */

  /* c8 ignore start - WebGL-dependent code path; covered by Plan 3's Playwright E2E */
  // Update visibility. Same overlaysReadyRef-gated defer pattern as the
  // layerBundle effect: if the overlays haven't been re-added yet after a
  // style swap, queue the visibility apply on style.load rather than calling
  // `setLayoutProperty` against a layer that doesn't exist.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeScan) return;
    const apply = (): void => {
      applyVisibility(map, activeScan);
    };
    if (overlaysReadyRef.current) {
      apply();
    } else {
      void map.once('style.load', apply);
    }
  }, [activeScan?.layerVisibility, activeScan]);
  /* c8 ignore stop */

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 400 }} />;
}
