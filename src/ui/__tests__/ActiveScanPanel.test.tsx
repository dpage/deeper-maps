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
import { ActiveScanPanel } from '../ActiveScanPanel';

const SCAN: StoredScan = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  name: 'My active scan',
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
  layerVisibility: { bathymetry: true, weed: false, fishDensity: true, sweetSpots: true },
  baseLayer: 'osm',
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
});

afterEach(async () => {
  await closeDeeperMapsDb();
});

describe('<ActiveScanPanel/>', () => {
  it('renders nothing when there is no active scan', () => {
    useDeeperMapsStore.setState({
      scans: {},
      activeScanId: null,
      layerBundle: null,
      progress: null,
      warnings: [],
    });
    const { container } = render(<ActiveScanPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when activeScanId points to a missing scan', () => {
    useDeeperMapsStore.setState({
      scans: {},
      activeScanId: 'no-such-id',
      layerBundle: null,
      progress: null,
      warnings: [],
    });
    const { container } = render(<ActiveScanPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the active scan name and layer controls', () => {
    useDeeperMapsStore.setState({
      scans: { [SCAN.id]: SCAN },
      activeScanId: SCAN.id,
      layerBundle: null,
      progress: null,
      warnings: [],
    });
    render(<ActiveScanPanel />);
    expect(screen.getByText('My active scan')).toBeInTheDocument();
    expect(screen.getByLabelText('Bathymetry')).toBeInTheDocument();
  });
});
