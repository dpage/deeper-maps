import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('maplibre-gl', async () => import('../map/__tests__/__mocks__/maplibre-gl'));

import { useDeeperMapsStore } from '../state/store';
import { closeDeeperMapsDb } from '../storage/db';
import { App } from '../App';

beforeEach(async () => {
  await closeDeeperMapsDb();
  indexedDB.deleteDatabase('deeper-maps');
  globalThis.localStorage?.clear();
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
    baseLayer: 'osm',
    viewMode: '2d',
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

  // Coverage extension: picking a 2D basemap from the combined View selector
  // dispatches BOTH setBaseLayer and setViewMode on the store — the App wires
  // the header's callbacks straight through.
  it('choosing 2D Satellite dispatches setBaseLayer and setViewMode', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const setBaseLayerMock = vi.fn();
    const setViewModeMock = vi.fn();
    useDeeperMapsStore.setState({ setBaseLayer: setBaseLayerMock, setViewMode: setViewModeMock });
    render(<App />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /2D Satellite/i }));
    expect(setBaseLayerMock).toHaveBeenCalledWith('satellite');
    expect(setViewModeMock).toHaveBeenCalledWith('2d');
  });

  // Switching to the 3D model dispatches setViewMode without touching baseLayer.
  it('choosing 3D Model dispatches setViewMode to 3d', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const setViewModeMock = vi.fn();
    useDeeperMapsStore.setState({ setViewMode: setViewModeMock });
    render(<App />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /3D Model/i }));
    expect(setViewModeMock).toHaveBeenCalledWith('3d');
  });

  // The header reflects the current global baseLayer regardless of whether a
  // scan is active. Pre-populate the store with `satellite` and assert the
  // combined selector shows it.
  it('reflects the global baseLayer in the header when no scan is active', () => {
    useDeeperMapsStore.setState({ baseLayer: 'satellite', viewMode: '2d' });
    render(<App />);
    // The View selector renders its value as visible text; querying by the
    // rendered "2D Satellite" label is the cleanest signal.
    expect(screen.getByText(/2D Satellite/i)).toBeInTheDocument();
  });
});
