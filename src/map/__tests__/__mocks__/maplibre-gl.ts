// Minimal MapLibre mock for component tests. Records every imperative call
// so tests can assert what the component did.

import { vi } from 'vitest';

/**
 * Tracks every `setData` call made via `getSource(...).setData(...)` across
 * all `MockMap` instances. Tests that need to assert on per-source data
 * pushes (e.g. the cache-hit-before-mount regression) can read this list
 * directly. Reset it with `__resetSetDataCalls()` in `beforeEach`.
 */
export const __setDataCalls: { sourceId: string; data: GeoJSON.FeatureCollection }[] = [];

/**
 * Tracks every `addImage` call so tests can assert that the fish-icon SDF
 * was registered before the fish-density layer was added. Reset via
 * `__resetAddImageCalls()`.
 */
export const __addImageCalls: { id: string; options?: { sdf?: boolean } }[] = [];

/**
 * Tracks every `fitBounds` call so the bounds-on-load test can assert the
 * map framed itself on the active scan's data extents. Reset via
 * `__resetFitBoundsCalls()`.
 */
export const __fitBoundsCalls: {
  bounds: [[number, number], [number, number]];
  options: Record<string, unknown>;
}[] = [];

/**
 * Tracks every `addLayer` call across all MockMap instances so tests can
 * assert layer registration order (e.g. z-order checks). Reset via
 * `__resetAddLayerCalls()`.
 */
export const __addLayerCalls: { id: string }[] = [];

/**
 * Tracks every `setStyle` call so the base-layer-swap test can assert that
 * we swap the style instead of tearing down the map. Reset via
 * `__resetSetStyleCalls()`.
 */
export const __setStyleCalls: { style: unknown; options?: Record<string, unknown> }[] = [];

/**
 * Tracks every `setLayoutProperty(layerId, name, value)` call so the weed
 * visibility tests can assert which layer was shown / hidden. Reset via
 * `__resetSetLayoutPropertyCalls()`.
 */
export const __setLayoutPropertyCalls: { layerId: string; name: string; value: unknown }[] = [];

/**
 * Tracks every `setPaintProperty(layerId, name, value)` call so tests can
 * assert that colour-expression updates are pushed after a bundle update.
 * Reset via `__resetSetPaintPropertyCalls()`.
 */
export const __setPaintPropertyCalls: { layerId: string; name: string; value: unknown }[] = [];

export function __resetSetDataCalls(): void {
  __setDataCalls.length = 0;
}
export function __resetAddImageCalls(): void {
  __addImageCalls.length = 0;
}
export function __resetFitBoundsCalls(): void {
  __fitBoundsCalls.length = 0;
}
export function __resetAddLayerCalls(): void {
  __addLayerCalls.length = 0;
}
export function __resetSetStyleCalls(): void {
  __setStyleCalls.length = 0;
}
export function __resetSetLayoutPropertyCalls(): void {
  __setLayoutPropertyCalls.length = 0;
}
export function __resetSetPaintPropertyCalls(): void {
  __setPaintPropertyCalls.length = 0;
}
export function __resetAll(): void {
  __resetSetDataCalls();
  __resetAddImageCalls();
  __resetFitBoundsCalls();
  __resetAddLayerCalls();
  __resetSetStyleCalls();
  __resetSetLayoutPropertyCalls();
  __resetSetPaintPropertyCalls();
  __isStyleLoadedReturn = true;
  __deferStyleLoadCallbacks = false;
  __pendingStyleLoadCallbacks.length = 0;
}

/**
 * Lets a test simulate "style is mid-swap": when set to `false`, subsequent
 * `MockMap.isStyleLoaded()` calls return `false`. By default, flipping this to
 * `false` ALSO stops `once('style.load', cb)` from auto-firing — but tests
 * that need to dissociate the two flags (e.g. simulate the regression where
 * `isStyleLoaded()` returns true while overlays have not yet been re-added)
 * can use `__setDeferStyleLoadCallbacks(true)` to force-queue regardless.
 */
export let __isStyleLoadedReturn = true;
export function __setStyleLoaded(loaded: boolean): void {
  __isStyleLoadedReturn = loaded;
}
/**
 * When true, `once('style.load', cb)` queues the callback regardless of the
 * current `__isStyleLoadedReturn`. Lets tests simulate the buggy MapLibre
 * window where the BASE style has parsed (`isStyleLoaded() === true`) but
 * the `style.load` event has not yet fired (so our overlay re-add has not
 * happened). Reset by `__resetAll()` and by `__flushStyleLoad()`.
 */
export let __deferStyleLoadCallbacks = false;
export function __setDeferStyleLoadCallbacks(defer: boolean): void {
  __deferStyleLoadCallbacks = defer;
}
export const __pendingStyleLoadCallbacks: Array<() => void> = [];
export function __flushStyleLoad(): void {
  // Mimic MapLibre: by the time style.load fires, the style has actually
  // loaded, so isStyleLoaded() reads true again. Also clear the defer flag —
  // the test scenario it simulates (mid-swap) is over once the event lands.
  __isStyleLoadedReturn = true;
  __deferStyleLoadCallbacks = false;
  const cbs = __pendingStyleLoadCallbacks.splice(0);
  for (const cb of cbs) cb();
}

class MockMap {
  loaded = vi.fn(() => true);
  isStyleLoaded = vi.fn(() => __isStyleLoadedReturn);
  // Most tests just need 'load' to fire on next tick. 'style.load' fires the
  // same way (production code uses it after `setStyle`).
  on = vi.fn((event: string, cb: () => void) => {
    if (event === 'load') setTimeout(cb, 0);
    if (event === 'style.load') {
      if (__isStyleLoadedReturn && !__deferStyleLoadCallbacks) setTimeout(cb, 0);
      else __pendingStyleLoadCallbacks.push(cb);
    }
    return this;
  });
  once = vi.fn((event: string, cb: () => void) => {
    if (event === 'load') setTimeout(cb, 0);
    if (event === 'style.load') {
      if (__isStyleLoadedReturn && !__deferStyleLoadCallbacks) setTimeout(cb, 0);
      else __pendingStyleLoadCallbacks.push(cb);
    }
    return this;
  });
  addSource = vi.fn();
  removeSource = vi.fn();
  addLayer = vi.fn((layer: { id: string }) => {
    __addLayerCalls.push({ id: layer.id });
  });
  removeLayer = vi.fn();
  getLayer = vi.fn(() => null);
  getSource = vi.fn((sourceId: string) => ({
    setData: vi.fn((data: GeoJSON.FeatureCollection) => {
      __setDataCalls.push({ sourceId, data });
    }),
  }));
  addImage = vi.fn((id: string, _img: unknown, options?: { sdf?: boolean }) => {
    __addImageCalls.push(options ? { id, options } : { id });
  });
  hasImage = vi.fn(() => false);
  removeImage = vi.fn();
  setLayoutProperty = vi.fn((layerId: string, name: string, value: unknown) => {
    __setLayoutPropertyCalls.push({ layerId, name, value });
  });
  setPaintProperty = vi.fn((layerId: string, name: string, value: unknown) => {
    __setPaintPropertyCalls.push({ layerId, name, value });
  });
  setStyle = vi.fn((style: unknown, options?: Record<string, unknown>) => {
    __setStyleCalls.push(options ? { style, options } : { style });
  });
  remove = vi.fn();
  resize = vi.fn();
  setCenter = vi.fn();
  setZoom = vi.fn();
  fitBounds = vi.fn(
    (bounds: [[number, number], [number, number]], options: Record<string, unknown>) => {
      __fitBoundsCalls.push({ bounds, options });
    },
  );
}

export class Map extends MockMap {}
export const NavigationControl = vi.fn();
export class AttributionControl {
  constructor() {}
}
export default { Map, NavigationControl, AttributionControl };
