import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DepthGrid, LayerBundle } from '../../analysis/types';
import { useDeeperMapsStore } from '../../state/store';
import { closeDeeperMapsDb } from '../../storage/db';
import { OrbitCube } from '../OrbitCube';

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
  useDeeperMapsStore.setState({ viewMode: '3d', viewBearing: 0, viewPitch: 55 });
});

afterEach(async () => {
  await closeDeeperMapsDb();
});

describe('<OrbitCube/>', () => {
  it('renders nothing in 2D', () => {
    useDeeperMapsStore.setState({ viewMode: '2d', layerBundle: bundle(DEPTH_GRID) });
    const { container } = render(<OrbitCube />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing in 3D without a depth grid', () => {
    useDeeperMapsStore.setState({ viewMode: '3d', layerBundle: bundle(null) });
    const { container } = render(<OrbitCube />);
    expect(container.firstChild).toBeNull();
  });

  it('renders an orbit handle in 3D with data', () => {
    useDeeperMapsStore.setState({ viewMode: '3d', layerBundle: bundle(DEPTH_GRID) });
    render(<OrbitCube />);
    expect(screen.getByRole('button', { name: /orbit/i })).toBeInTheDocument();
  });

  it('dragging updates bearing (horizontal) and pitch (vertical)', () => {
    useDeeperMapsStore.setState({
      viewMode: '3d',
      viewBearing: 0,
      viewPitch: 55,
      layerBundle: bundle(DEPTH_GRID),
    });
    render(<OrbitCube />);
    const cube = screen.getByRole('button', { name: /orbit/i });
    fireEvent.pointerDown(cube, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(cube, { pointerId: 1, clientX: 120, clientY: 110 });
    fireEvent.pointerUp(cube, { pointerId: 1, clientX: 120, clientY: 110 });
    // dx=20, dy=10 at 0.6 deg/px → +12° bearing, +6° pitch.
    expect(useDeeperMapsStore.getState().viewBearing).toBeCloseTo(12);
    expect(useDeeperMapsStore.getState().viewPitch).toBeCloseTo(61);
  });

  it('ignores a pointer move with no drag in progress', () => {
    useDeeperMapsStore.setState({
      viewMode: '3d',
      viewBearing: 33,
      viewPitch: 44,
      layerBundle: bundle(DEPTH_GRID),
    });
    render(<OrbitCube />);
    const cube = screen.getByRole('button', { name: /orbit/i });
    // No preceding pointerDown → the move is a no-op.
    fireEvent.pointerMove(cube, { pointerId: 1, clientX: 200, clientY: 200 });
    expect(useDeeperMapsStore.getState().viewBearing).toBe(33);
    expect(useDeeperMapsStore.getState().viewPitch).toBe(44);
  });

  it('a click (no drag) resets to the default north-facing view', () => {
    useDeeperMapsStore.setState({
      viewMode: '3d',
      viewBearing: 140,
      viewPitch: 30,
      layerBundle: bundle(DEPTH_GRID),
    });
    render(<OrbitCube />);
    const cube = screen.getByRole('button', { name: /orbit/i });
    fireEvent.pointerDown(cube, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(cube, { pointerId: 1, clientX: 50, clientY: 50 });
    expect(useDeeperMapsStore.getState().viewBearing).toBe(0);
    expect(useDeeperMapsStore.getState().viewPitch).toBe(55);
  });
});
