import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_CELL_OPTIONS,
  DEFAULT_COLOR_SCALE_OPTIONS,
  DEFAULT_LIFTOUT_OPTIONS,
  DEFAULT_SONAR_OPTIONS,
} from '../../analysis/constants';
import { useDeeperMapsStore } from '../../state/store';
import { closeDeeperMapsDb } from '../../storage/db';
import type { StoredScan } from '../../storage/types';
import { Legend } from '../Legend';

const SCAN: StoredScan = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  name: 'X',
  deviceType: 'quest',
  contentHash: 'h',
  createdAt: 0,
  updatedAt: 0,
  fileMeta: [],
  thresholds: {
    liftout: DEFAULT_LIFTOUT_OPTIONS,
    sonar: DEFAULT_SONAR_OPTIONS,
    cell: DEFAULT_CELL_OPTIONS,
    category: DEFAULT_CATEGORY_THRESHOLDS,
    colorScale: DEFAULT_COLOR_SCALE_OPTIONS,
  },
  layerVisibility: {
    bathymetry: true,
    weed: false,
    fishDensity: true,
    sweetSpots: true,
    temperature: false,
  },
};

beforeEach(async () => {
  await closeDeeperMapsDb();
  indexedDB.deleteDatabase('deeper-maps');
  globalThis.__deeperMapsWorker = {
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    terminate: vi.fn(),
  } as unknown as Worker;
  // Every test starts in 2D unless it opts into 3D, independent of run order.
  useDeeperMapsStore.setState({ viewMode: '2d' });
});

afterEach(async () => {
  await closeDeeperMapsDb();
});

describe('<Legend/>', () => {
  it('renders nothing when no layerBundle is loaded', () => {
    useDeeperMapsStore.setState({
      scans: { [SCAN.id]: SCAN },
      activeScanId: SCAN.id,
      layerBundle: null,
      progress: null,
      warnings: [],
    });
    const { container } = render(<Legend />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when there is no active scan', () => {
    useDeeperMapsStore.setState({
      scans: {},
      activeScanId: null,
      layerBundle: {
        bathymetry: { type: 'FeatureCollection', features: [] },
        weed: { type: 'FeatureCollection', features: [] },
        bathymetryLines: { type: 'FeatureCollection', features: [] },
        fishDensity: { type: 'FeatureCollection', features: [] },
        sweetSpots: { type: 'FeatureCollection', features: [] },
        temperature: { type: 'FeatureCollection', features: [] },
        scales: {
          depth: { min: 0.5, max: 3.0, levels: [] },
          weed: { min: 0, max: 0.3, levels: [] },
          fishRate: { min: 0, max: 0.5, levels: [] },
          temperature: { min: 0, max: 1, levels: [] },
        },
        bounds: null,
        tempStats: null,
      },
      progress: null,
      warnings: [],
    });
    const { container } = render(<Legend />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when active scan id has no matching scan', () => {
    useDeeperMapsStore.setState({
      scans: {},
      activeScanId: 'missing-id',
      layerBundle: {
        bathymetry: { type: 'FeatureCollection', features: [] },
        weed: { type: 'FeatureCollection', features: [] },
        bathymetryLines: { type: 'FeatureCollection', features: [] },
        fishDensity: { type: 'FeatureCollection', features: [] },
        sweetSpots: { type: 'FeatureCollection', features: [] },
        temperature: { type: 'FeatureCollection', features: [] },
        scales: {
          depth: { min: 0.5, max: 3.0, levels: [] },
          weed: { min: 0, max: 0.3, levels: [] },
          fishRate: { min: 0, max: 0.5, levels: [] },
          temperature: { min: 0, max: 1, levels: [] },
        },
        bounds: null,
        tempStats: null,
      },
      progress: null,
      warnings: [],
    });
    const { container } = render(<Legend />);
    expect(container.firstChild).toBeNull();
  });

  it('renders only legend rows for visible layers', () => {
    useDeeperMapsStore.setState({
      scans: { [SCAN.id]: SCAN },
      activeScanId: SCAN.id,
      layerBundle: {
        bathymetry: { type: 'FeatureCollection', features: [] },
        weed: { type: 'FeatureCollection', features: [] },
        bathymetryLines: { type: 'FeatureCollection', features: [] },
        fishDensity: { type: 'FeatureCollection', features: [] },
        sweetSpots: { type: 'FeatureCollection', features: [] },
        temperature: { type: 'FeatureCollection', features: [] },
        scales: {
          depth: { min: 0.5, max: 3.0, levels: [] },
          weed: { min: 0, max: 0.3, levels: [] },
          fishRate: { min: 0, max: 0.5, levels: [] },
          temperature: { min: 0, max: 1, levels: [] },
        },
        bounds: null,
        tempStats: null,
      },
      progress: null,
      warnings: [],
    });
    render(<Legend />);
    expect(screen.getByText(/depth/i)).toBeInTheDocument();
    // weed layer is hidden in SCAN.layerVisibility — no row should render starting with "Weed:"
    expect(screen.queryByText(/^weed:/i)).toBeNull();
    expect(screen.getByText(/fish rate/i)).toBeInTheDocument();
    expect(screen.getByText(/sweet spots/i)).toBeInTheDocument();
    // Sweet-spot categorical labels.
    expect(screen.getByText(/^gold$/i)).toBeInTheDocument();
    expect(screen.getByText(/^silver$/i)).toBeInTheDocument();
    expect(screen.getByText(/^bronze$/i)).toBeInTheDocument();
    expect(screen.getByText(/^weeded$/i)).toBeInTheDocument();
  });

  it('renders weed row when weed visibility is enabled', () => {
    const scanWithWeed: StoredScan = {
      ...SCAN,
      layerVisibility: { ...SCAN.layerVisibility, weed: true },
    };
    useDeeperMapsStore.setState({
      scans: { [scanWithWeed.id]: scanWithWeed },
      activeScanId: scanWithWeed.id,
      layerBundle: {
        bathymetry: { type: 'FeatureCollection', features: [] },
        weed: { type: 'FeatureCollection', features: [] },
        bathymetryLines: { type: 'FeatureCollection', features: [] },
        fishDensity: { type: 'FeatureCollection', features: [] },
        sweetSpots: { type: 'FeatureCollection', features: [] },
        temperature: { type: 'FeatureCollection', features: [] },
        scales: {
          depth: { min: 0.5, max: 3.0, levels: [] },
          weed: { min: 0, max: 0.3, levels: [] },
          fishRate: { min: 0, max: 0.5, levels: [] },
          temperature: { min: 0, max: 1, levels: [] },
        },
        bounds: null,
        tempStats: null,
      },
      progress: null,
      warnings: [],
    });
    render(<Legend />);
    expect(screen.getByText(/^weed:/i)).toBeInTheDocument();
  });

  it('renders the temperature row when scan.layerVisibility.temperature is true', () => {
    useDeeperMapsStore.setState({
      layerBundle: {
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
          temperature: { min: 12.4, max: 16.7, levels: [12.4, 14, 16.7] },
        },
        bounds: null,
        tempStats: { min: 12.4, mean: 14.2, max: 16.7 },
      },
      activeScanId: SCAN.id,
      scans: {
        [SCAN.id]: { ...SCAN, layerVisibility: { ...SCAN.layerVisibility, temperature: true } },
      },
    });
    render(<Legend />);
    expect(screen.getByText(/Temp:.*12\.4.*16\.7.*°C/)).toBeInTheDocument();
  });

  it('in 3D mode shows only the depth ramp, even with other layers enabled', () => {
    // SCAN has fishDensity + sweetSpots visible, but the 3D surface is depth-
    // coloured only, so their legend rows must be suppressed.
    useDeeperMapsStore.setState({
      viewMode: '3d',
      scans: { [SCAN.id]: SCAN },
      activeScanId: SCAN.id,
      layerBundle: {
        bathymetry: { type: 'FeatureCollection', features: [] },
        weed: { type: 'FeatureCollection', features: [] },
        bathymetryLines: { type: 'FeatureCollection', features: [] },
        fishDensity: { type: 'FeatureCollection', features: [] },
        sweetSpots: { type: 'FeatureCollection', features: [] },
        temperature: { type: 'FeatureCollection', features: [] },
        scales: {
          depth: { min: 0.5, max: 3.0, levels: [] },
          weed: { min: 0, max: 0.3, levels: [] },
          fishRate: { min: 0, max: 0.5, levels: [] },
          temperature: { min: 0, max: 1, levels: [] },
        },
        bounds: null,
        tempStats: null,
      },
      progress: null,
      warnings: [],
    });
    render(<Legend />);
    expect(screen.getByText(/depth/i)).toBeInTheDocument();
    expect(screen.queryByText(/fish rate/i)).toBeNull();
    expect(screen.queryByText(/sweet spots/i)).toBeNull();
  });

  it('hides the temperature row when scan.layerVisibility.temperature is false', () => {
    useDeeperMapsStore.setState({
      layerBundle: {
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
          temperature: { min: 12.4, max: 16.7, levels: [12.4, 14, 16.7] },
        },
        bounds: null,
        tempStats: { min: 12.4, mean: 14.2, max: 16.7 },
      },
      activeScanId: SCAN.id,
      scans: {
        [SCAN.id]: { ...SCAN, layerVisibility: { ...SCAN.layerVisibility, temperature: false } },
      },
    });
    render(<Legend />);
    expect(screen.queryByText(/Temp:/)).toBeNull();
  });
});
