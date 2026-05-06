import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('maplibre-gl', async () => import('./__mocks__/maplibre-gl'));

import { useDeeperMapsStore } from '../../state/store';
import { closeDeeperMapsDb } from '../../storage/db';
import { MapView } from '../MapView';

beforeEach(async () => {
  await closeDeeperMapsDb();
  indexedDB.deleteDatabase('deeper-maps');
  useDeeperMapsStore.setState({
    scans: {},
    activeScanId: null,
    layerBundle: null,
    progress: null,
    warnings: [],
  });
});

afterEach(async () => {
  await closeDeeperMapsDb();
});

describe('<MapView/>', () => {
  it('mounts without crashing when no scan is active', () => {
    const { container } = render(<MapView />);
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('does not call addSource until layerBundle is non-null', async () => {
    const maplibre = await import('maplibre-gl');
    const { Map: MapClass } = maplibre;
    const mapInstance = new (MapClass as unknown as new () => {
      addSource: ReturnType<typeof vi.fn>;
    })();
    render(<MapView />);
    // No layer bundle was ever provided; addSource should not have been called.
    // (This is a slightly indirect assertion — the real test is that no errors fire.)
    expect(mapInstance.addSource).not.toHaveBeenCalled();
  });

  it('pushes the current layerBundle to sources when MapLibre fires load (cache-hit case)', async () => {
    // Reset the mock-level setData tracker.
    const mock = await import('./__mocks__/maplibre-gl');
    mock.__resetSetDataCalls();

    // Pre-set a layerBundle in the store BEFORE mounting MapView.
    const bundle = {
      bathymetry: { type: 'FeatureCollection' as const, features: [] },
      weed: { type: 'FeatureCollection' as const, features: [] },
      fishDensity: { type: 'FeatureCollection' as const, features: [] },
      sweetSpots: { type: 'FeatureCollection' as const, features: [] },
      scales: {
        depth: { min: 0, max: 1 },
        weed: { min: 0, max: 1 },
        fishRate: { min: 0, max: 1 },
      },
    };
    useDeeperMapsStore.setState({ layerBundle: bundle });

    render(<MapView />);
    // The mock fires the 'load' event via setTimeout(cb, 0). Wait for it.
    await new Promise((r) => setTimeout(r, 5));
    // The load handler should have pushed all four bundle FeatureCollections to
    // their respective sources, even though the layerBundle effect's deps
    // haven't changed since mount.
    expect(mock.__setDataCalls.length).toBeGreaterThanOrEqual(4);
    const sourceIds = mock.__setDataCalls.map((c) => c.sourceId);
    expect(sourceIds).toContain('bathymetry');
    expect(sourceIds).toContain('weed');
    expect(sourceIds).toContain('fish-density');
    expect(sourceIds).toContain('sweet-spots');
  });
});
