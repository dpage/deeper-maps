import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('maplibre-gl', async () => import('../map/__tests__/__mocks__/maplibre-gl'));

import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_CELL_OPTIONS,
  DEFAULT_COLOR_SCALE_OPTIONS,
  DEFAULT_LIFTOUT_OPTIONS,
  DEFAULT_SONAR_OPTIONS,
} from '../analysis/constants';
import { useDeeperMapsStore } from '../state/store';
import { closeDeeperMapsDb } from '../storage/db';
import { saveScan } from '../storage/scans';
import type { StoredScan } from '../storage/types';
import { App } from '../App';

const DEFAULT_THRESHOLDS = {
  liftout: DEFAULT_LIFTOUT_OPTIONS,
  sonar: DEFAULT_SONAR_OPTIONS,
  cell: DEFAULT_CELL_OPTIONS,
  category: DEFAULT_CATEGORY_THRESHOLDS,
  colorScale: DEFAULT_COLOR_SCALE_OPTIONS,
};

function makeScan(id: string, name: string): StoredScan {
  return {
    id,
    name,
    deviceType: 'quest',
    contentHash: 'h',
    createdAt: 0,
    updatedAt: 0,
    fileMeta: [],
    thresholds: DEFAULT_THRESHOLDS,
    layerVisibility: { bathymetry: true, weed: true, fishDensity: true, sweetSpots: true },
    baseLayer: 'osm',
  };
}

beforeEach(async () => {
  await closeDeeperMapsDb();
  indexedDB.deleteDatabase('deeper-maps');
  globalThis.__deeperMapsWorker = {
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    terminate: vi.fn(),
  } as unknown as Worker;
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

describe('<App/>', () => {
  it('renders the header, drawer, and main map area on first paint', () => {
    render(<App />);
    expect(screen.getByText(/Deeper Maps/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload scan/i })).toBeInTheDocument();
  });

  it('clicking Upload scan opens the dialog', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /upload scan/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // Coverage extension: the upload dialog's onClose path (Cancel button)
  // exercises the `() => setUploadOpen(false)` branch in App.tsx.
  it('Cancel in the Upload dialog closes it', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /upload scan/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    // MUI Dialog uses a transition; wait for it to unmount.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  // Coverage extension: when there's an active scan, the AppHeader picks up
  // its baseLayer and the onBaseLayerChange callback dispatches to the store.
  // Exercises the truthy branch of `activeScanId ? scans[activeScanId] : undefined`
  // and the truthy side of `activeScan && void setBaseLayer(activeScan.id, b)`.
  it('with an active scan: changing the base layer dispatches setBaseLayer for that scan', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const scan = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lake A');
    // Persist the scan so App's hydrate() picks it up. Otherwise hydrate
    // overwrites the store's `scans` to `{}` and the inline gate
    // `activeScan && void setBaseLayer(...)` evaluates to falsy.
    await saveScan(scan, []);
    const setBaseLayerMock = vi.fn(async () => {});
    useDeeperMapsStore.setState({
      scans: { [scan.id]: scan },
      activeScanId: scan.id,
      setBaseLayer: setBaseLayerMock,
    });
    render(<App />);
    // Wait for hydrate() to complete so `scans` contains the persisted scan.
    await waitFor(() => expect(useDeeperMapsStore.getState().scans[scan.id]).toBeDefined());
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /satellite/i }));
    expect(setBaseLayerMock).toHaveBeenCalledWith(scan.id, 'satellite');
  });

  // Coverage extension: when there's NO active scan, the gated callback is a
  // no-op. We can't easily trigger the BaseLayerSelect onChange when there's
  // no scan visible (the AppHeader is still there but ActiveScanPanel is
  // hidden), so we just verify the gate by clicking through and confirming
  // setBaseLayer was NOT called. This exercises the falsy branch.
  it('with no active scan: changing the base layer is a no-op', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const setBaseLayerSpy = vi
      .spyOn(useDeeperMapsStore.getState(), 'setBaseLayer')
      .mockResolvedValue();
    render(<App />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /satellite/i }));
    expect(setBaseLayerSpy).not.toHaveBeenCalled();
    setBaseLayerSpy.mockRestore();
  });
});
