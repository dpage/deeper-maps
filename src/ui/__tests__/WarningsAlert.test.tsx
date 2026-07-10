import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerBundle } from '../../analysis/types';
import { useDeeperMapsStore } from '../../state/store';
import { closeDeeperMapsDb } from '../../storage/db';
import { WarningsAlert } from '../WarningsAlert';

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

describe('<WarningsAlert/>', () => {
  it('renders nothing when there are no warnings', () => {
    render(<WarningsAlert />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an error (no bundle) when analysis produced nothing', () => {
    useDeeperMapsStore.setState({
      warnings: ['aggregateCells: too many cells (>100000). Increase cellSizeM.'],
      layerBundle: null,
    });
    render(<WarningsAlert />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/too many cells/i);
    expect(alert.className).toMatch(/Error/);
  });

  it('shows an advisory warning (bundle present) for benign parse warnings', () => {
    useDeeperMapsStore.setState({
      warnings: ['sonar.csv missing — bathymetry-only mode'],
      layerBundle: emptyBundle(),
    });
    render(<WarningsAlert />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/bathymetry-only/i);
    expect(alert.className).toMatch(/Warning|Standard/);
  });

  it('closes when dismissed and stays closed for the same warnings', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const { waitForElementToBeRemoved } = await import('@testing-library/react');
    const user = userEvent.setup();

    useDeeperMapsStore.setState({ warnings: ['boom'], layerBundle: null });
    render(<WarningsAlert />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close/i }));
    await waitForElementToBeRemoved(() => screen.queryByRole('alert'), { timeout: 5000 });
  });

  it('does NOT dismiss on a click-away (so panning the map keeps the error up)', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    useDeeperMapsStore.setState({ warnings: ['sticky error'], layerBundle: null });
    render(<WarningsAlert />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // A click outside the snackbar triggers MUI's clickaway path, which we
    // intentionally ignore.
    await user.click(document.body);
    expect(screen.getByRole('alert')).toHaveTextContent('sticky error');
  });

  it('re-opens when a fresh set of warnings arrives after dismissal', () => {
    useDeeperMapsStore.setState({ warnings: ['first'], layerBundle: null });
    const { rerender } = render(<WarningsAlert />);
    expect(screen.getByRole('alert')).toHaveTextContent('first');

    // A different message must re-open even if the previous was dismissed.
    act(() => {
      useDeeperMapsStore.setState({ warnings: ['second, different'] });
    });
    rerender(<WarningsAlert />);
    expect(screen.getByRole('alert')).toHaveTextContent('second, different');
  });
});
