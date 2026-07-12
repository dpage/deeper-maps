import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DepthGrid, LayerBundle } from '../../analysis/types';
import { useDeeperMapsStore } from '../../state/store';
import { closeDeeperMapsDb } from '../../storage/db';
import { LakeBed3DControls } from '../LakeBed3DControls';

const DEPTH_GRID: DepthGrid = {
  width: 2,
  height: 2,
  cellSizeM: 1,
  origin: { x: 0, y: 0 },
  anchor: { lat0: 0, lon0: 0, lonMetresPerDeg: 111000, latMetresPerDeg: 111000 },
  values: Float32Array.from([1, 2, 3, 4]),
};

function bundle(depthGrid: DepthGrid | null): LayerBundle {
  return {
    bathymetry: { type: 'FeatureCollection', features: [] },
    weed: { type: 'FeatureCollection', features: [] },
    bathymetryLines: { type: 'FeatureCollection', features: [] },
    fishDensity: { type: 'FeatureCollection', features: [] },
    sweetSpots: { type: 'FeatureCollection', features: [] },
    temperature: { type: 'FeatureCollection', features: [] },
    depthGrid,
    scales: {
      depth: { min: 1, max: 4, levels: [] },
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
  useDeeperMapsStore.setState({ viewMode: '2d', verticalExaggeration: 6, layerBundle: null });
});

afterEach(async () => {
  await closeDeeperMapsDb();
});

describe('<LakeBed3DControls/>', () => {
  it('renders nothing in 2D mode', () => {
    useDeeperMapsStore.setState({ viewMode: '2d', layerBundle: bundle(DEPTH_GRID) });
    const { container } = render(<LakeBed3DControls />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing in 3D mode when there is no depth grid', () => {
    useDeeperMapsStore.setState({ viewMode: '3d', layerBundle: bundle(null) });
    const { container } = render(<LakeBed3DControls />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing in 3D mode when there is no bundle at all', () => {
    useDeeperMapsStore.setState({ viewMode: '3d', layerBundle: null });
    const { container } = render(<LakeBed3DControls />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the exaggeration slider in 3D mode with a depth grid', () => {
    useDeeperMapsStore.setState({
      viewMode: '3d',
      verticalExaggeration: 8,
      layerBundle: bundle(DEPTH_GRID),
    });
    render(<LakeBed3DControls />);
    expect(screen.getByText(/Vertical exaggeration ×8/i)).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /vertical exaggeration/i })).toBeInTheDocument();
    expect(screen.getByText(/tilt & rotate/i)).toBeInTheDocument();
  });

  it('pushes slider changes into the store', () => {
    useDeeperMapsStore.setState({
      viewMode: '3d',
      verticalExaggeration: 6,
      layerBundle: bundle(DEPTH_GRID),
    });
    render(<LakeBed3DControls />);
    const slider = screen.getByRole('slider', { name: /vertical exaggeration/i });
    // MUI Slider responds to keyboard arrows — a deterministic way to nudge it.
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(useDeeperMapsStore.getState().verticalExaggeration).toBe(7);
  });
});
