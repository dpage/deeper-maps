// Minimal MapLibre mock for component tests. Records every imperative call
// so tests can assert what the component did.

import { vi } from 'vitest';

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
  getSource = vi.fn(() => ({ setData: vi.fn() }));
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
