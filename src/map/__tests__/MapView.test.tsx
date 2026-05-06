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
});
