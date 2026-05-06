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

export function __resetSetDataCalls(): void {
  __setDataCalls.length = 0;
}

class MockMap {
  loaded = vi.fn(() => true);
  on = vi.fn((event: string, cb: () => void) => {
    if (event === 'load') setTimeout(cb, 0);
    return this;
  });
  addSource = vi.fn();
  removeSource = vi.fn();
  addLayer = vi.fn();
  removeLayer = vi.fn();
  getLayer = vi.fn(() => null);
  getSource = vi.fn((sourceId: string) => ({
    setData: vi.fn((data: GeoJSON.FeatureCollection) => {
      __setDataCalls.push({ sourceId, data });
    }),
  }));
  setLayoutProperty = vi.fn();
  setStyle = vi.fn();
  remove = vi.fn();
  resize = vi.fn();
  setCenter = vi.fn();
  setZoom = vi.fn();
  fitBounds = vi.fn();
}

export class Map extends MockMap {}
export const NavigationControl = vi.fn();
export class AttributionControl {
  constructor() {}
}
export default { Map, NavigationControl, AttributionControl };
