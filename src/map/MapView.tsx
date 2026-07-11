import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { LayerBundle } from '../analysis/types';
import { useDeeperMapsStore } from '../state/store';
import { DEFAULT_MAX_SWEET_SPOTS, type BaseLayerId, type LayerVisibility } from '../storage/types';
import { buildFishIcon } from './fishIcon';
import {
  BATHYMETRY_LAYER_ID,
  BATHYMETRY_SOURCE_ID,
  buildBathymetryColorExpression,
  buildBathymetryStyle,
} from './layers/bathymetry';
import {
  BATHYMETRY_LINES_LAYER_ID,
  BATHYMETRY_LINES_SOURCE_ID,
  buildBathymetryLinesColorExpression,
  buildBathymetryLinesStyle,
} from './layers/bathymetryLines';
import {
  FISH_DENSITY_LAYER_ID,
  FISH_DENSITY_SOURCE_ID,
  FISH_ICON_NAME,
  buildFishDensityColorExpression,
  buildFishDensityStyle,
} from './layers/fishDensity';
import {
  SWEET_SPOTS_LAYER_ID,
  SWEET_SPOTS_SOURCE_ID,
  buildSweetSpotsStyle,
  selectTopSweetSpots,
} from './layers/sweetSpots';
import {
  TEMPERATURE_LAYER_ID,
  TEMPERATURE_SOURCE_ID,
  buildTemperatureColorExpression,
  buildTemperatureStyle,
} from './layers/temperature';
import {
  WEED_LAYER_ID,
  WEED_SOURCE_ID,
  buildWeedColorExpression,
  buildWeedStyle,
} from './layers/weed';
import {
  findNearestSpot,
  formatSpotPopupHtml,
  spotDistanceMeters,
  type SpotProperties,
} from './spotInfo';

// A tap counts as "on the scan" when the nearest measured cell is within this
// many cell-widths (in real-world metres, so it's zoom-independent). Beyond it
// the tap is treated as outside the scanned area and closes any open popup.
// Cell-relative so coarse-cell scans stay tappable between passes; floored so
// fine-cell scans keep a comfortable tolerance.
const SPOT_HIT_CELLS = 4;
const SPOT_HIT_FLOOR_M = 15;

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
// `bathymetry` is handled specially (see `applyVisibility`) because it
// toggles between the filled and line-style bathymetry layers depending on
// whether weed or temperature is also visible.
const LAYER_VISIBILITY_KEYS: Array<{ key: keyof LayerVisibility; layerId: string }> = [
  { key: 'weed', layerId: WEED_LAYER_ID },
  { key: 'fishDensity', layerId: FISH_DENSITY_LAYER_ID },
  { key: 'sweetSpots', layerId: SWEET_SPOTS_LAYER_ID },
  { key: 'temperature', layerId: TEMPERATURE_LAYER_ID },
];

/**
 * Apply the given scan's layerVisibility flags to all overlay layers.
 *
 * Simple layers (weed, fish density, sweet spots, temperature) map 1:1 from a
 * boolean visibility flag to `setLayoutProperty(layerId, 'visibility', ...)`.
 *
 * Bathymetry is special: when bathymetry and ANY filled overlay (weed OR
 * temperature) are both visible, we render bathymetry as line contours (the
 * cultural "elevation contour" cue) over the filled overlay colour. Otherwise —
 * bath alone — we render the filled contours; bath off hides both.
 */
function applyVisibility(map: MapLibreMap, scan: { layerVisibility: LayerVisibility }): void {
  for (const { key, layerId } of LAYER_VISIBILITY_KEYS) {
    map.setLayoutProperty(layerId, 'visibility', scan.layerVisibility[key] ? 'visible' : 'none');
  }
  const filledOverlayOn = scan.layerVisibility.weed || scan.layerVisibility.temperature;
  const bathOn = scan.layerVisibility.bathymetry;
  // Bath-fill: visible only when bath is on AND no filled overlay is on (so we
  // don't have two filled layers competing).
  map.setLayoutProperty(
    BATHYMETRY_LAYER_ID,
    'visibility',
    bathOn && !filledOverlayOn ? 'visible' : 'none',
  );
  // Bath-lines: visible when bath is on AND a filled overlay is on (depth
  // contours over weed or temperature fill).
  map.setLayoutProperty(
    BATHYMETRY_LINES_LAYER_ID,
    'visibility',
    bathOn && filledOverlayOn ? 'visible' : 'none',
  );
}

function styleFor(base: BaseLayerId): maplibregl.StyleSpecification {
  return base === 'satellite' ? SATELLITE_STYLE : OSM_STYLE;
}

type SetDataSrc = { setData: (d: GeoJSON.FeatureCollection) => void };

/**
 * Update the colour-interpolate expressions for all scale-driven overlay
 * layers to reflect the scan's actual data range. Must be called after
 * the sources have been registered (i.e. inside or after addOverlaysAndReplay)
 * and after every layerBundle update, so that values outside the initial
 * fallback [0, 1] range are rendered with the correct colour rather than being
 * clamped to the ramp endpoint.
 */
function applyColorExpressions(map: MapLibreMap, bundle: LayerBundle): void {
  map.setPaintProperty(
    BATHYMETRY_LAYER_ID,
    'fill-color',
    buildBathymetryColorExpression(bundle.scales.depth),
  );
  map.setPaintProperty(WEED_LAYER_ID, 'fill-color', buildWeedColorExpression(bundle.scales.weed));
  map.setPaintProperty(
    BATHYMETRY_LINES_LAYER_ID,
    'line-color',
    buildBathymetryLinesColorExpression(bundle.scales.depth),
  );
  map.setPaintProperty(
    TEMPERATURE_LAYER_ID,
    'fill-color',
    buildTemperatureColorExpression(bundle.scales.temperature),
  );
  map.setPaintProperty(
    FISH_DENSITY_LAYER_ID,
    'icon-color',
    buildFishDensityColorExpression(bundle.scales.fishRate),
  );
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
  // Tracks whether our overlay sources/layers have been (re-)added since the
  // last setStyle. MapLibre's `isStyleLoaded()` flips to true as soon as the
  // BASE style parses, but our overlay sources are only re-attached inside the
  // `style.load` handler — so `isStyleLoaded()` is NOT a safe gate for
  // `getSource(...).setData(...)`. This ref is.
  const overlaysReadyRef = useRef(false);
  // The full, unfiltered sweet-spots FeatureCollection from the current bundle.
  // The map only ever renders the best N within the viewport (see
  // `applySweetSpots`); we keep the complete set here so pans/zooms and
  // limit changes can re-derive that subset without a worker round-trip.
  const allSweetSpotsRef = useRef<GeoJSON.FeatureCollection | null>(null);
  // Per-cell "spot" points for the click-to-inspect popup, and the currently
  // open popup (if any). Kept in refs so the long-lived map click handler reads
  // the latest set without re-subscribing.
  const spotsRef = useRef<GeoJSON.Feature<GeoJSON.Point>[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const closeSpotPopup = (): void => {
    popupRef.current?.remove();
    popupRef.current = null;
  };
  const layerBundle = useDeeperMapsStore((s) => s.layerBundle);
  const activeScanId = useDeeperMapsStore((s) => s.activeScanId);
  const scans = useDeeperMapsStore((s) => s.scans);
  const activeScan = activeScanId ? scans[activeScanId] : undefined;
  const maxSweetSpots = activeScan?.maxSweetSpots ?? DEFAULT_MAX_SWEET_SPOTS;
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
    // A popup from the previous scan would point at a stale location once a new
    // scan loads; dismiss it on any (re)selection.
    closeSpotPopup();
  }, [frameRequestSeq]);
  /* c8 ignore stop */

  /* c8 ignore start - WebGL-dependent code path; covered by Plan 3's Playwright E2E */
  /**
   * Push the best N sweet spots for the current viewport into the sweet-spots
   * source. Reads the cap and full set fresh (from the store and the ref) so it
   * is safe to call from a long-lived `moveend` listener without a stale
   * closure. No-op until a bundle has populated `allSweetSpotsRef`.
   */
  const applySweetSpots = (map: MapLibreMap): void => {
    const fc = allSweetSpotsRef.current;
    if (!fc) return;
    const snapshot = useDeeperMapsStore.getState();
    const scan = snapshot.activeScanId ? snapshot.scans[snapshot.activeScanId] : undefined;
    const limit = scan?.maxSweetSpots ?? DEFAULT_MAX_SWEET_SPOTS;
    const b = map.getBounds();
    const top = selectTopSweetSpots(
      fc,
      { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
      limit,
    );
    (map.getSource(SWEET_SPOTS_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(top);
  };
  /* c8 ignore stop */

  /* c8 ignore start - WebGL-dependent code path; covered by Plan 3's Playwright E2E */
  /**
   * Handle a tap on the map: open an info popup for the nearest scanned cell
   * within the hit threshold, replacing any popup already open. A tap that
   * lands outside the scan area (no cell within threshold) just closes the
   * current popup. The nearest-cell search is a pure helper; here we only
   * convert the winner to screen space to apply the pixel threshold.
   */
  const handleMapClick = (map: MapLibreMap, e: maplibregl.MapMouseEvent): void => {
    const spots = spotsRef.current;
    const nearest = spots.length > 0 ? findNearestSpot(spots, e.lngLat.lng, e.lngLat.lat) : null;
    if (!nearest) {
      closeSpotPopup();
      return;
    }
    const snapshot = useDeeperMapsStore.getState();
    const scan = snapshot.activeScanId ? snapshot.scans[snapshot.activeScanId] : undefined;
    const cellSizeM = scan?.thresholds.cell.cellSizeM ?? 2;
    const thresholdM = Math.max(cellSizeM * SPOT_HIT_CELLS, SPOT_HIT_FLOOR_M);
    if (spotDistanceMeters(nearest, e.lngLat.lng, e.lngLat.lat) > thresholdM) {
      closeSpotPopup();
      return;
    }
    const [lon, lat] = nearest.geometry.coordinates as [number, number];
    closeSpotPopup();
    popupRef.current = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '260px',
    })
      .setLngLat([lon, lat])
      .setHTML(formatSpotPopupHtml(nearest.properties as unknown as SpotProperties))
      .addTo(map);
  };
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

    const fallback = { min: 0, max: 1, levels: [] };
    // Layer order matters — `addLayer` appends, and later layers render on
    // top of earlier ones. All filled overlays (bath-fill, weed-fill,
    // temperature-fill) are registered first so they sit at the bottom.
    // Bath-lines are registered above all filled overlays so depth contour
    // lines remain visible regardless of which fill layers are active.
    // Fish-density and sweet-spots markers are last so they always render
    // on top of everything.
    for (const builder of [
      buildBathymetryStyle(fallback),
      buildWeedStyle(fallback),
      buildTemperatureStyle(fallback),
      buildBathymetryLinesStyle(fallback),
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
      (map.getSource(BATHYMETRY_LINES_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
        initialBundle.bathymetryLines,
      );
      (map.getSource(TEMPERATURE_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
        initialBundle.temperature,
      );
      (map.getSource(FISH_DENSITY_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
        initialBundle.fishDensity,
      );
      allSweetSpotsRef.current = initialBundle.sweetSpots;
      applySweetSpots(map);
      spotsRef.current = (initialBundle.spots?.features ?? []) as GeoJSON.Feature<GeoJSON.Point>[];
      applyColorExpressions(map, initialBundle);
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
    // Re-pick the best-N sweet spots for the new extent whenever the user
    // finishes panning/zooming. Registered once; the handler reads all inputs
    // fresh so it never goes stale. `map.remove()` tears the listener down.
    map.on('moveend', () => applySweetSpots(map));
    // Click-to-inspect: open/replace/close the spot info popup.
    map.on('click', (e) => handleMapClick(map, e));
    return () => {
      closeSpotPopup();
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
      (map.getSource(BATHYMETRY_LINES_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
        layerBundle.bathymetryLines,
      );
      (map.getSource(TEMPERATURE_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
        layerBundle.temperature,
      );
      (map.getSource(FISH_DENSITY_SOURCE_ID) as unknown as SetDataSrc | null)?.setData(
        layerBundle.fishDensity,
      );
      allSweetSpotsRef.current = layerBundle.sweetSpots;
      applySweetSpots(map);
      spotsRef.current = (layerBundle.spots?.features ?? []) as GeoJSON.Feature<GeoJSON.Point>[];
      applyColorExpressions(map, layerBundle);
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

  /* c8 ignore start - WebGL-dependent code path; covered by Plan 3's Playwright E2E */
  // Re-derive the visible sweet-spot subset when the per-scan cap changes
  // (slider drag). The full set in `allSweetSpotsRef` is untouched; only how
  // many we render changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !overlaysReadyRef.current) return;
    applySweetSpots(map);
  }, [maxSweetSpots]);
  /* c8 ignore stop */

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 400 }} />;
}
