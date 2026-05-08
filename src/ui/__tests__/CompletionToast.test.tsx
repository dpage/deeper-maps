import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerBundle } from '../../analysis/types';
import { useDeeperMapsStore } from '../../state/store';
import { closeDeeperMapsDb } from '../../storage/db';
import { CompletionToast } from '../CompletionToast';

function emptyBundle(): LayerBundle {
  return {
    bathymetry: { type: 'FeatureCollection', features: [] },
    weed: { type: 'FeatureCollection', features: [] },
    bathymetryLines: { type: 'FeatureCollection', features: [] },
    fishDensity: { type: 'FeatureCollection', features: [] },
    sweetSpots: { type: 'FeatureCollection', features: [] },
    temperature: { type: 'FeatureCollection', features: [] },
    scales: {
      depth: { min: 0, max: 1, levels: [] },
      weed: { min: 0, max: 1, levels: [] },
      fishRate: { min: 0, max: 1, levels: [] },
      temperature: { min: 0, max: 1, levels: [] },
    },
    bounds: null,
    tempStats: null,
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

describe('<CompletionToast/>', () => {
  it('renders nothing visible initially (progress is null)', () => {
    render(<CompletionToast />);
    expect(screen.queryByText(/analysis complete/i)).toBeNull();
  });

  it('shows the toast when progress transitions non-null → null AND a new layerBundle landed', () => {
    // Arrange: in-flight analysis with no bundle yet.
    useDeeperMapsStore.setState({
      progress: { stage: 'parse', processed: 1, total: 2 },
      layerBundle: null,
    });
    render(<CompletionToast />);
    expect(screen.queryByText(/analysis complete/i)).toBeNull();

    // Act: worker finishes — clears progress, lands a fresh bundle.
    act(() => {
      useDeeperMapsStore.setState({ progress: null, layerBundle: emptyBundle() });
    });

    // Assert: snackbar is visible.
    expect(screen.getByText(/analysis complete/i)).toBeInTheDocument();
  });

  it('does NOT show the toast when progress clears without a new bundle (cancel / error)', () => {
    useDeeperMapsStore.setState({
      progress: { stage: 'parse', processed: 1, total: 2 },
      layerBundle: null,
    });
    render(<CompletionToast />);

    // Act: cancel-like transition — progress cleared, bundle still null.
    act(() => {
      useDeeperMapsStore.setState({ progress: null });
    });

    expect(screen.queryByText(/analysis complete/i)).toBeNull();
  });

  it('does NOT show the toast when progress clears but the bundle reference is unchanged', () => {
    const bundle = emptyBundle();
    useDeeperMapsStore.setState({
      progress: { stage: 'parse', processed: 1, total: 2 },
      layerBundle: bundle,
    });
    render(<CompletionToast />);

    // Cancel mid-flight: the existing bundle is preserved (per store.ts'
    // 'cancelled' branch), so no "complete" toast should fire.
    act(() => {
      useDeeperMapsStore.setState({ progress: null, layerBundle: bundle });
    });

    expect(screen.queryByText(/analysis complete/i)).toBeNull();
  });

  it('auto-dismisses after the autoHideDuration elapses', async () => {
    const { waitForElementToBeRemoved } = await import('@testing-library/react');
    useDeeperMapsStore.setState({
      progress: { stage: 'parse', processed: 1, total: 2 },
      layerBundle: null,
    });
    render(<CompletionToast />);

    act(() => {
      useDeeperMapsStore.setState({ progress: null, layerBundle: emptyBundle() });
    });
    const text = screen.getByText(/analysis complete/i);
    expect(text).toBeInTheDocument();

    // Wait for MUI's Snackbar to call onClose after autoHideDuration AND
    // its exit-transition to finish unmounting the alert.
    await waitForElementToBeRemoved(() => screen.queryByText(/analysis complete/i), {
      timeout: 5000,
    });
  });

  it('closes when the user clicks the close button on the alert', async () => {
    const { waitForElementToBeRemoved } = await import('@testing-library/react');
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    useDeeperMapsStore.setState({
      progress: { stage: 'parse', processed: 1, total: 2 },
      layerBundle: null,
    });
    render(<CompletionToast />);
    act(() => {
      useDeeperMapsStore.setState({ progress: null, layerBundle: emptyBundle() });
    });
    expect(screen.getByText(/analysis complete/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close/i }));
    await waitForElementToBeRemoved(() => screen.queryByText(/analysis complete/i), {
      timeout: 5000,
    });
  });
});
